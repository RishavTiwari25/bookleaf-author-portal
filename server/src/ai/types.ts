// Shared AI types. The string values match the Prisma enums and the API contract exactly.

export const CATEGORIES = [
  'ROYALTY_PAYMENTS',
  'ISBN_METADATA',
  'PRINTING_QUALITY',
  'DISTRIBUTION_AVAILABILITY',
  'BOOK_STATUS_PRODUCTION',
  'GENERAL_INQUIRY',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  ROYALTY_PAYMENTS: 'Royalty & Payments',
  ISBN_METADATA: 'ISBN & Metadata Issues',
  PRINTING_QUALITY: 'Printing & Quality',
  DISTRIBUTION_AVAILABILITY: 'Distribution & Availability',
  BOOK_STATUS_PRODUCTION: 'Book Status & Production Updates',
  GENERAL_INQUIRY: 'General Inquiry',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
};

export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}

export function isPriority(value: unknown): value is Priority {
  return typeof value === 'string' && (PRIORITIES as readonly string[]).includes(value);
}

export interface BookContext {
  title: string;
  isbn: string;
  status: string;
  genre?: string;
  publicationDate?: string | Date | null;
  /** null while the book is still in production and has no price yet. */
  mrp: number | null;
  /** Optional: author's royalty per copy, if the server knows it. */
  authorRoyaltyPerCopy?: number | null;
  totalCopiesSold: number;
  totalRoyaltyEarned: number;
  royaltyPaid: number;
  royaltyPending: number;
  lastRoyaltyPayoutDate?: string | Date | null;
  printPartner?: string;
  availableOn: string[];
}

export interface TicketContext {
  /** Optional: when the caller passes the ticket id, it becomes part of the cache key. */
  ticketId?: string;
  subject: string;
  description: string;
  author: { name: string; email: string; city?: string; joinedDate?: string };
  book?: BookContext | null;
}

export interface ThreadMessage {
  from: 'AUTHOR' | 'ADMIN';
  body: string;
}

export type DraftContext = TicketContext & {
  category: Category;
  priority: Priority;
  thread?: ThreadMessage[];
};

export interface Classification {
  category: Category;
  priority: Priority;
  source: 'AI' | 'FALLBACK';
  reasoning?: string;
}

export interface Draft {
  body: string;
  source: 'AI' | 'FALLBACK';
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
}
