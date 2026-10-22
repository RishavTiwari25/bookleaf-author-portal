import type { Author, Book, Prisma, User } from '@prisma/client';

/** Tickets older than this that are still open/in progress get flagged in the admin queue. */
export const OVERDUE_AFTER_HOURS = 48;

const ACTIVE_STATUSES = ['OPEN', 'IN_PROGRESS'] as const;

export const isActiveStatus = (status: string) => (ACTIVE_STATUSES as readonly string[]).includes(status);

export const ticketNumber = (id: number) => `BL-${1000 + id}`;

const toDateOnly = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

const hoursSince = (date: Date) => Math.floor((Date.now() - date.getTime()) / 36e5);

export function serializeBook(book: Book) {
  return {
    id: book.id,
    bookCode: book.bookCode,
    title: book.title,
    isbn: book.isbn,
    genre: book.genre,
    publicationDate: toDateOnly(book.publicationDate),
    status: book.status,
    mrp: book.mrp,
    authorRoyaltyPerCopy: book.royaltyPerCopy,
    totalCopiesSold: book.totalCopiesSold,
    totalRoyaltyEarned: book.totalRoyaltyEarned,
    royaltyPaid: book.royaltyPaid,
    royaltyPending: book.royaltyPending,
    lastRoyaltyPayoutDate: toDateOnly(book.lastRoyaltyPayoutDate),
    printPartner: book.printPartner,
    availableOn: book.availableOn,
  };
}

/** Everything the summary + detail views need, loaded in one query. */
export const ticketInclude = {
  author: { include: { user: { select: { id: true, name: true, email: true } } } },
  book: true,
  assignee: { select: { id: true, name: true } },
  messages: {
    orderBy: { createdAt: 'asc' },
    include: { sender: { select: { id: true, name: true, role: true } } },
  },
} satisfies Prisma.TicketInclude;

export type TicketWithRelations = Prisma.TicketGetPayload<{ include: typeof ticketInclude }>;

export function serializeTicketSummary(ticket: TicketWithRelations) {
  const responses = ticket.messages.filter((m) => m.kind === 'RESPONSE');
  const ageHours = hoursSince(ticket.createdAt);
  return {
    id: ticket.id,
    ticketNumber: ticketNumber(ticket.id),
    subject: ticket.subject,
    status: ticket.status,
    category: ticket.category,
    categorySource: ticket.categorySource,
    priority: ticket.priority,
    prioritySource: ticket.prioritySource,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    ageHours,
    isOverdue: isActiveStatus(ticket.status) && ageHours >= OVERDUE_AFTER_HOURS,
    author: { id: ticket.author.id, name: ticket.author.user.name },
    book: ticket.book ? { id: ticket.book.id, title: ticket.book.title } : null,
    assignee: ticket.assignee,
    responseCount: responses.length,
    lastActivityAt: ticket.updatedAt.toISOString(),
  };
}

function serializeResponses(ticket: TicketWithRelations) {
  return ticket.messages
    .filter((m) => m.kind === 'RESPONSE')
    .map((m) => ({
      id: m.id,
      body: m.body,
      author: { id: m.sender.id, name: m.sender.name, role: m.sender.role },
      createdAt: m.createdAt.toISOString(),
    }));
}

/** What an author is allowed to see: no internal notes, no AI metadata. */
export function serializeTicketForAuthor(ticket: TicketWithRelations) {
  return {
    ...serializeTicketSummary(ticket),
    description: ticket.description,
    attachmentName: ticket.attachmentName,
    responses: serializeResponses(ticket),
  };
}

type AuthorWithUser = Author & { user: Pick<User, 'id' | 'name' | 'email'> };

function serializeAuthorProfile(author: AuthorWithUser) {
  return {
    id: author.id,
    name: author.user.name,
    email: author.user.email,
    phone: author.phone,
    city: author.city,
    joinedDate: toDateOnly(author.joinedDate),
  };
}

/** Full view for the support team. */
export function serializeTicketForAdmin(ticket: TicketWithRelations) {
  return {
    ...serializeTicketForAuthor(ticket),
    author: serializeAuthorProfile(ticket.author),
    book: ticket.book ? serializeBook(ticket.book) : null,
    aiReasoning: ticket.aiReasoning,
    internalNotes: ticket.messages
      .filter((m) => m.kind === 'INTERNAL_NOTE')
      .map((m) => ({
        id: m.id,
        body: m.body,
        author: { id: m.sender.id, name: m.sender.name },
        createdAt: m.createdAt.toISOString(),
      })),
    draft: ticket.draftBody
      ? {
          body: ticket.draftBody,
          source: ticket.draftSource,
          model: ticket.draftModel,
          createdAt: ticket.draftCreatedAt?.toISOString() ?? null,
        }
      : null,
  };
}
