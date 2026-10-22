import { z } from 'zod';
import { CATEGORIES, PRIORITIES } from '../ai/types';

export const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;

/** Route param `:id` -> positive integer, otherwise a 400. */
export const ticketIdParam = z.coerce.number().int().positive({ message: 'Ticket id must be a positive number' });

export const createTicketSchema = z.object({
  bookId: z.string().trim().min(1).nullable(),
  subject: z.string().trim().min(5, 'Subject must be at least 5 characters').max(150),
  description: z
    .string()
    .trim()
    .min(20, 'Please describe the issue in at least 20 characters')
    .max(5000),
  attachmentName: z.string().trim().max(255).optional(),
});

export const queueQuerySchema = z.object({
  status: z.enum(STATUSES).optional(),
  category: z.enum(CATEGORIES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  assignee: z.enum(['me', 'unassigned']).optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(['urgency', 'oldest', 'newest']).default('urgency'),
});

export const updateTicketSchema = z
  .object({
    status: z.enum(STATUSES).optional(),
    category: z.enum(CATEGORIES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    assigneeId: z.string().min(1).nullable().optional(),
  })
  .refine((v) => Object.values(v).some((field) => field !== undefined), {
    message: 'Provide at least one of status, category, priority or assigneeId',
  });

export const draftSchema = z.object({ regenerate: z.boolean().default(false) });

export const responseSchema = z.object({
  body: z.string().trim().min(1, 'Response cannot be empty').max(10000),
  usedDraft: z.boolean().default(false),
});

export const noteSchema = z.object({
  body: z.string().trim().min(1, 'Note cannot be empty').max(5000),
});
