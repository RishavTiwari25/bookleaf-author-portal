import type { BookContext, TicketContext } from '../../src/ai/types';

export const author = { name: 'Priya Sharma', email: 'priya@example.com', city: 'Pune' };

export const book: BookContext = {
  title: 'The Monsoon Letters',
  isbn: '978-93-5000-123-4',
  status: 'PUBLISHED',
  genre: 'Fiction',
  publicationDate: '2026-03-10',
  mrp: 299,
  totalCopiesSold: 200,
  totalRoyaltyEarned: 3000,
  royaltyPaid: 3000,
  royaltyPending: 0,
  lastRoyaltyPayoutDate: '2026-08-10',
  printPartner: 'Repro India',
  availableOn: ['Amazon India', 'Flipkart'],
};

export function ticket(subject: string, description: string, withBook: BookContext | null = book): TicketContext {
  return { subject, description, author, book: withBook };
}
