import type { Prisma, Priority, TicketCategory, TicketStatus } from '@prisma/client';
import { classifyTicket, draftResponse, type Classification } from '../ai';
import { prisma } from '../db';
import { AppError, notFound } from '../lib/errors';
import type { AuthUser } from '../middleware/auth';
import { buildTicketContext } from './aiContext';
import { publishTicketEvent } from './events';
import {
  isActiveStatus,
  OVERDUE_AFTER_HOURS,
  serializeTicketForAdmin,
  serializeTicketForAuthor,
  serializeTicketSummary,
  ticketInclude,
  type TicketWithRelations,
} from './serializers';

const PRIORITY_WEIGHT: Record<Priority, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/** Upper bound on queue size per request; enough for a support team's working view. */
const QUEUE_LIMIT = 500;

function requireAuthorId(user: AuthUser): string {
  if (!user.authorId) throw new AppError('FORBIDDEN', 'Only authors can do this');
  return user.authorId;
}

async function loadTicket(where: Prisma.TicketWhereInput): Promise<TicketWithRelations> {
  const ticket = await prisma.ticket.findFirst({ where, include: ticketInclude });
  if (!ticket) throw notFound('Ticket');
  return ticket;
}

function contextFor(ticket: TicketWithRelations) {
  return buildTicketContext({
    ticketId: ticket.id,
    subject: ticket.subject,
    description: ticket.description,
    author: { ...ticket.author, name: ticket.author.user.name, email: ticket.author.user.email },
    book: ticket.book,
  });
}

/** The AI module promises never to throw, but ticket creation must never fail because of AI, so we guard anyway. */
async function safeClassify(ctx: Parameters<typeof classifyTicket>[0]): Promise<Classification> {
  try {
    return await classifyTicket(ctx);
  } catch (err) {
    console.error('[tickets] classifyTicket threw, using safe default', err);
    return { category: 'GENERAL_INQUIRY', priority: 'MEDIUM', source: 'FALLBACK', reasoning: 'Classifier unavailable' };
  }
}

// ---------- Author side ----------

export interface CreateTicketInput {
  bookId: string | null;
  subject: string;
  description: string;
  attachmentName?: string;
}

export async function createTicket(user: AuthUser, input: CreateTicketInput) {
  const authorId = requireAuthorId(user);

  const author = await prisma.author.findUniqueOrThrow({ where: { id: authorId }, include: { user: true } });

  // An author can only raise a ticket about their own book.
  const book = input.bookId
    ? await prisma.book.findFirst({ where: { id: input.bookId, authorId } })
    : null;
  if (input.bookId && !book) {
    throw new AppError('VALIDATION_ERROR', 'Selected book was not found in your account', [
      { field: 'bookId', message: 'Unknown book' },
    ]);
  }

  // Classify before saving so the queue never shows an unclassified ticket.
  // classifyTicket falls back to keyword heuristics if the AI is slow or down.
  const classification = await safeClassify(
    buildTicketContext({
      subject: input.subject,
      description: input.description,
      author: { ...author, name: author.user.name, email: author.user.email },
      book,
    }),
  );

  const created = await prisma.ticket.create({
    data: {
      authorId,
      bookId: book?.id ?? null,
      subject: input.subject,
      description: input.description,
      attachmentName: input.attachmentName,
      category: classification.category,
      categorySource: classification.source,
      priority: classification.priority,
      prioritySource: classification.source,
      aiReasoning: classification.reasoning,
    },
    include: ticketInclude,
  });

  publishTicketEvent({ type: 'ticket.created', ticketId: created.id, authorId });
  return serializeTicketForAuthor(created);
}

export async function listAuthorTickets(user: AuthUser) {
  const authorId = requireAuthorId(user);
  const tickets = await prisma.ticket.findMany({
    where: { authorId },
    include: ticketInclude,
    orderBy: { updatedAt: 'desc' },
  });
  return tickets.map(serializeTicketSummary);
}

/** Scoped by authorId, so another author's ticket id simply 404s (we don't reveal it exists). */
export async function getAuthorTicket(user: AuthUser, ticketId: number) {
  const authorId = requireAuthorId(user);
  return serializeTicketForAuthor(await loadTicket({ id: ticketId, authorId }));
}

// ---------- Admin side ----------

export interface QueueFilters {
  status?: TicketStatus;
  category?: TicketCategory;
  priority?: Priority;
  from?: Date;
  to?: Date;
  assignee?: 'me' | 'unassigned';
  q?: string;
  sort: 'urgency' | 'oldest' | 'newest';
}

/**
 * Urgency = unresolved first, then priority (Critical > High > Medium > Low), then oldest first.
 * Sorting in memory keeps the rule readable; the query is capped at QUEUE_LIMIT rows.
 */
export function byUrgency(a: TicketWithRelations, b: TicketWithRelations) {
  const activeDiff = Number(isActiveStatus(b.status)) - Number(isActiveStatus(a.status));
  if (activeDiff !== 0) return activeDiff;
  const priorityDiff = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
  if (priorityDiff !== 0) return priorityDiff;
  return a.createdAt.getTime() - b.createdAt.getTime();
}

export async function listQueue(user: AuthUser, filters: QueueFilters) {
  const where: Prisma.TicketWhereInput = {
    status: filters.status,
    category: filters.category,
    priority: filters.priority,
    createdAt: filters.from || filters.to ? { gte: filters.from, lte: filters.to } : undefined,
  };
  if (filters.assignee === 'me') where.assigneeId = user.id;
  if (filters.assignee === 'unassigned') where.assigneeId = null;
  if (filters.q) {
    where.OR = [
      { subject: { contains: filters.q, mode: 'insensitive' } },
      { description: { contains: filters.q, mode: 'insensitive' } },
      { author: { user: { name: { contains: filters.q, mode: 'insensitive' } } } },
      { book: { title: { contains: filters.q, mode: 'insensitive' } } },
    ];
  }

  const tickets = await prisma.ticket.findMany({
    where,
    include: ticketInclude,
    orderBy: { createdAt: filters.sort === 'newest' ? 'desc' : 'asc' },
    take: QUEUE_LIMIT,
  });
  if (filters.sort === 'urgency') tickets.sort(byUrgency);

  const [byStatus, byPriority] = await Promise.all([
    prisma.ticket.groupBy({ by: ['status'], _count: true }),
    // Priority counts only make sense for work that is still open.
    prisma.ticket.groupBy({ by: ['priority'], where: { status: { in: ['OPEN', 'IN_PROGRESS'] } }, _count: true }),
  ]);

  return {
    tickets: tickets.map(serializeTicketSummary),
    counts: {
      byStatus: Object.fromEntries(byStatus.map((row) => [row.status, row._count])),
      byPriority: Object.fromEntries(byPriority.map((row) => [row.priority, row._count])),
    },
  };
}

export async function getAdminTicket(ticketId: number) {
  return serializeTicketForAdmin(await loadTicket({ id: ticketId }));
}

export interface TicketUpdate {
  status?: TicketStatus;
  category?: TicketCategory;
  priority?: Priority;
  assigneeId?: string | null;
}

export async function updateTicket(ticketId: number, update: TicketUpdate) {
  const ticket = await loadTicket({ id: ticketId });
  const data: Prisma.TicketUncheckedUpdateInput = {};

  if (update.status && update.status !== ticket.status) {
    data.status = update.status;
    data.resolvedAt = isActiveStatus(update.status) ? null : new Date();
  }
  if (update.category && update.category !== ticket.category) {
    data.category = update.category;
    data.categorySource = 'MANUAL';
    // The draft was grounded in the old category's knowledge base, so it is stale now.
    data.draftBody = null;
    data.draftSource = null;
    data.draftModel = null;
    data.draftCreatedAt = null;
  }
  if (update.priority && update.priority !== ticket.priority) {
    data.priority = update.priority;
    data.prioritySource = 'MANUAL';
  }
  if (update.assigneeId !== undefined) {
    if (update.assigneeId !== null) {
      const assignee = await prisma.user.findFirst({ where: { id: update.assigneeId, role: 'ADMIN' } });
      if (!assignee) {
        throw new AppError('VALIDATION_ERROR', 'Tickets can only be assigned to support team members', [
          { field: 'assigneeId', message: 'Unknown admin user' },
        ]);
      }
    }
    data.assigneeId = update.assigneeId;
  }

  const updated = await prisma.ticket.update({ where: { id: ticketId }, data, include: ticketInclude });
  publishTicketEvent({ type: 'ticket.updated', ticketId, authorId: updated.authorId });
  return serializeTicketForAdmin(updated);
}

export async function assignToMe(user: AuthUser, ticketId: number) {
  return updateTicket(ticketId, { assigneeId: user.id });
}

/** Returns the cached draft unless `regenerate` is set. Drafts are cached on the ticket row. */
export async function getDraft(ticketId: number, regenerate: boolean) {
  const ticket = await loadTicket({ id: ticketId });

  if (ticket.draftBody && !regenerate) {
    return {
      body: ticket.draftBody,
      source: ticket.draftSource,
      model: ticket.draftModel,
      createdAt: ticket.draftCreatedAt?.toISOString() ?? null,
      cached: true,
    };
  }

  const thread = ticket.messages
    .filter((m) => m.kind === 'RESPONSE')
    .map((m) => ({ from: m.sender.role === 'ADMIN' ? ('ADMIN' as const) : ('AUTHOR' as const), body: m.body }));

  const draft = await draftResponse({
    ...contextFor(ticket),
    category: ticket.category,
    priority: ticket.priority,
    thread,
  });

  const saved = await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      draftBody: draft.body,
      draftSource: draft.source,
      draftModel: draft.model ?? null,
      draftCreatedAt: new Date(),
    },
  });

  return {
    body: draft.body,
    source: draft.source,
    model: draft.model ?? null,
    createdAt: saved.draftCreatedAt?.toISOString() ?? null,
    cached: false,
  };
}

export async function addResponse(user: AuthUser, ticketId: number, body: string, usedDraft: boolean) {
  const ticket = await loadTicket({ id: ticketId });

  const [message] = await prisma.$transaction([
    prisma.ticketMessage.create({
      data: { ticketId, senderId: user.id, kind: 'RESPONSE', body, usedDraft },
      include: { sender: { select: { id: true, name: true, role: true } } },
    }),
    prisma.ticket.update({
      where: { id: ticketId },
      data: {
        // Replying to a new ticket means someone is working on it.
        status: ticket.status === 'OPEN' ? 'IN_PROGRESS' : undefined,
        // First responder picks it up if nobody owns it yet.
        assigneeId: ticket.assigneeId ?? user.id,
        updatedAt: new Date(),
      },
    }),
  ]);

  publishTicketEvent({ type: 'ticket.response', ticketId, authorId: ticket.authorId });
  return {
    id: message.id,
    body: message.body,
    author: message.sender,
    createdAt: message.createdAt.toISOString(),
  };
}

export async function addInternalNote(user: AuthUser, ticketId: number, body: string) {
  const ticket = await loadTicket({ id: ticketId });
  const note = await prisma.ticketMessage.create({
    data: { ticketId, senderId: user.id, kind: 'INTERNAL_NOTE', body },
    include: { sender: { select: { id: true, name: true } } },
  });
  publishTicketEvent({ type: 'ticket.updated', ticketId, authorId: ticket.authorId, adminOnly: true });
  return { id: note.id, body: note.body, author: note.sender, createdAt: note.createdAt.toISOString() };
}

export async function getStats() {
  const [byStatus, activeByPriority, active] = await Promise.all([
    prisma.ticket.groupBy({ by: ['status'], _count: true }),
    prisma.ticket.groupBy({ by: ['priority'], where: { status: { in: ['OPEN', 'IN_PROGRESS'] } }, _count: true }),
    prisma.ticket.findMany({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } }, select: { createdAt: true } }),
  ]);

  const statusCount = (s: TicketStatus) => byStatus.find((r) => r.status === s)?._count ?? 0;
  const priorityCount = (p: Priority) => activeByPriority.find((r) => r.priority === p)?._count ?? 0;
  const ages = active.map((t) => (Date.now() - t.createdAt.getTime()) / 36e5);

  return {
    open: statusCount('OPEN'),
    inProgress: statusCount('IN_PROGRESS'),
    resolved: statusCount('RESOLVED'),
    closed: statusCount('CLOSED'),
    critical: priorityCount('CRITICAL'),
    high: priorityCount('HIGH'),
    overdue: ages.filter((h) => h >= OVERDUE_AFTER_HOURS).length,
    avgAgeHours: ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : 0,
  };
}
