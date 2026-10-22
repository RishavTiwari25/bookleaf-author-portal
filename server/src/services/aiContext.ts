import type { TicketContext } from '../ai';

type Dateish = Date | null | undefined;
const dateOnly = (d: Dateish) => (d ? d.toISOString().slice(0, 10) : undefined);

interface ContextInput {
  ticketId?: number;
  subject: string;
  description: string;
  author: { name: string; email: string; city: string | null; joinedDate: Date };
  book: {
    title: string;
    isbn: string;
    status: string;
    genre: string;
    publicationDate: Date | null;
    mrp: number | null;
    royaltyPerCopy: number | null;
    totalCopiesSold: number;
    totalRoyaltyEarned: number;
    royaltyPaid: number;
    royaltyPending: number;
    lastRoyaltyPayoutDate: Date | null;
    printPartner: string | null;
    availableOn: string[];
  } | null;
}

/**
 * Maps database rows to the plain object the AI module expects.
 * Only the fields the model actually needs go in: no phone numbers, no other authors' data.
 */
export function buildTicketContext(input: ContextInput): TicketContext {
  const { book } = input;
  return {
    ticketId: input.ticketId === undefined ? undefined : String(input.ticketId),
    subject: input.subject,
    description: input.description,
    author: {
      name: input.author.name,
      email: input.author.email,
      city: input.author.city ?? undefined,
      joinedDate: dateOnly(input.author.joinedDate),
    },
    book: book
      ? {
          title: book.title,
          isbn: book.isbn,
          status: book.status,
          genre: book.genre,
          publicationDate: dateOnly(book.publicationDate),
          mrp: book.mrp,
          authorRoyaltyPerCopy: book.royaltyPerCopy,
          totalCopiesSold: book.totalCopiesSold,
          totalRoyaltyEarned: book.totalRoyaltyEarned,
          royaltyPaid: book.royaltyPaid,
          royaltyPending: book.royaltyPending,
          lastRoyaltyPayoutDate: dateOnly(book.lastRoyaltyPayoutDate) ?? null,
          printPartner: book.printPartner ?? undefined,
          availableOn: book.availableOn,
        }
      : null,
  };
}
