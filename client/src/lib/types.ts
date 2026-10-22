// Types mirror docs/API_CONTRACT.md exactly.

export type Role = 'AUTHOR' | 'ADMIN';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type Category =
  | 'ROYALTY_PAYMENTS'
  | 'ISBN_METADATA'
  | 'PRINTING_QUALITY'
  | 'DISTRIBUTION_AVAILABILITY'
  | 'BOOK_STATUS_PRODUCTION'
  | 'GENERAL_INQUIRY';
export type AiSource = 'AI' | 'FALLBACK' | 'MANUAL';

export const STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
};

export const CATEGORY_LABELS: Record<Category, string> = {
  ROYALTY_PAYMENTS: 'Royalty & Payments',
  ISBN_METADATA: 'ISBN & Metadata Issues',
  PRINTING_QUALITY: 'Printing & Quality',
  DISTRIBUTION_AVAILABILITY: 'Distribution & Availability',
  BOOK_STATUS_PRODUCTION: 'Book Status & Production Updates',
  GENERAL_INQUIRY: 'General Inquiry',
};

// Object.keys loses the literal type, so keep explicit ordered lists.
export const STATUSES: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
export const PRIORITIES: Priority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
export const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface Book {
  id: string;
  bookCode: string;
  title: string;
  isbn: string;
  genre: string;
  publicationDate: string | null; // null while the book is still in production
  status: string; // free text from the dataset, e.g. "Published & Live"
  mrp: number | null;
  authorRoyaltyPerCopy: number | null;
  totalCopiesSold: number;
  totalRoyaltyEarned: number;
  royaltyPaid: number;
  royaltyPending: number;
  lastRoyaltyPayoutDate: string | null;
  printPartner: string | null;
  availableOn: string[];
}

export interface BookSummary {
  totalBooks: number;
  totalCopiesSold: number;
  totalRoyaltyEarned: number;
  royaltyPaid: number;
  royaltyPending: number;
}

// Ticket/message ids are autoincrement integers on the server; book and user ids are strings.
export type NumericId = number | string;

export interface TicketSummary {
  id: NumericId;
  ticketNumber: string;
  subject: string;
  status: TicketStatus;
  category: Category;
  categorySource: AiSource;
  priority: Priority;
  prioritySource: AiSource;
  createdAt: string;
  updatedAt: string;
  ageHours: number;
  isOverdue?: boolean; // server-computed: unresolved and older than 48 h
  author: { id: string; name: string };
  book: { id: string; title: string } | null;
  assignee: { id: string; name: string } | null;
  responseCount: number;
  lastActivityAt: string;
}

export interface TicketResponse {
  id: NumericId;
  body: string;
  author: { id: string; name: string; role: Role };
  createdAt: string;
}

export interface InternalNote {
  id: NumericId;
  body: string;
  author: { id: string; name: string };
  createdAt: string;
}

// The admin detail endpoint may send richer author/book objects. The extra
// fields are optional so the UI renders whatever is present.
export interface TicketDetail extends Omit<TicketSummary, 'author' | 'book'> {
  author: { id: string; name: string; email?: string; city?: string | null; joinedDate?: string | null };
  book: ({ id: string; title: string } & Partial<Omit<Book, 'id' | 'title'>>) | null;
  description: string;
  attachmentName: string | null;
  responses: TicketResponse[];
  internalNotes?: InternalNote[];
  aiReasoning?: string | null;
}

export interface Draft {
  body: string;
  source: AiSource;
  model?: string;
  createdAt: string;
}

export interface AdminStats {
  open: number;
  inProgress: number;
  resolved: number;
  closed: number;
  critical: number;
  high: number;
  avgAgeHours: number;
  aiEnabled: boolean;
}

export interface AdminTicketList {
  tickets: TicketSummary[];
  counts: {
    byStatus: Partial<Record<TicketStatus, number>>;
    byPriority: Partial<Record<Priority, number>>;
  };
}

// Validation limits from the contract.
export const SUBJECT_MIN = 5;
export const SUBJECT_MAX = 150;
export const DESCRIPTION_MIN = 20;
export const DESCRIPTION_MAX = 5000;
export const RESPONSE_MAX = 10000;
