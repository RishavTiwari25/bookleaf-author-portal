// Deterministic helpers: royalty payout dates, formatting, and the "author facts" block.
// The model never does date maths itself; we compute the facts in code and hand them over,
// which is both cheaper and much harder to get wrong.

import type { BookContext } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
export const PAYOUT_WINDOW_DAYS = 45;
export const MIN_PAYOUT_INR = 1000;

/** Quarter end dates (UTC midnight) for a given year: Mar 31, Jun 30, Sep 30, Dec 31. */
function quarterEnds(year: number): Date[] {
  return [
    new Date(Date.UTC(year, 2, 31)),
    new Date(Date.UTC(year, 5, 30)),
    new Date(Date.UTC(year, 8, 30)),
    new Date(Date.UTC(year, 11, 31)),
  ];
}

function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/** The most recent quarter end strictly before `date` (or on it). */
export function previousQuarterEnd(date: Date): Date {
  const day = startOfDayUtc(date);
  const candidates = [...quarterEnds(day.getUTCFullYear() - 1), ...quarterEnds(day.getUTCFullYear())];
  return candidates.filter((q) => q.getTime() <= day.getTime()).pop()!;
}

export interface NextPayout {
  /** The quarter the payout covers (its last day). */
  quarterEnd: Date;
  /** Payout is made on or before this date (quarter end + 45 days). */
  payoutBy: Date;
  /** Human label such as "Jul-Sep 2026". */
  quarterLabel: string;
}

/**
 * Next royalty payout from `today`.
 * If we are still inside the 45-day window of the last quarter, that payout is next;
 * otherwise it is the current quarter's payout.
 * Example: on 22 Oct 2026 the Jul-Sep quarter (ended 30 Sep) pays by 14 Nov 2026.
 */
export function nextPayoutDate(today: Date = new Date()): NextPayout {
  const day = startOfDayUtc(today);
  const lastEnd = previousQuarterEnd(day);
  const lastDeadline = addDays(lastEnd, PAYOUT_WINDOW_DAYS);

  let quarterEnd = lastEnd;
  if (day.getTime() > lastDeadline.getTime()) {
    // The last payout window has closed, so the next one is for the quarter we are in now.
    quarterEnd = quarterEnds(day.getUTCFullYear()).find((q) => q.getTime() > day.getTime())!;
  }
  return { quarterEnd, payoutBy: addDays(quarterEnd, PAYOUT_WINDOW_DAYS), quarterLabel: quarterLabel(quarterEnd) };
}

function quarterLabel(quarterEnd: Date): string {
  const months = ['Jan-Mar', 'Apr-Jun', 'Jul-Sep', 'Oct-Dec'];
  return `${months[Math.floor(quarterEnd.getUTCMonth() / 3)]} ${quarterEnd.getUTCFullYear()}`;
}

/**
 * Rough "is a royalty payment overdue?" check from the book data:
 * the author has at least the minimum payout pending, and the payout deadline of a quarter
 * that ended after publication has passed without a payout since that quarter ended.
 * Returns how many days overdue (0 = not overdue).
 */
export function royaltyOverdueDays(book: BookContext | null | undefined, today: Date = new Date()): number {
  if (!book || book.royaltyPending < MIN_PAYOUT_INR) return 0;
  const day = startOfDayUtc(today);
  const lastEnd = previousQuarterEnd(day);
  // The latest quarter whose payout deadline has already passed.
  const dueQuarter = addDays(lastEnd, PAYOUT_WINDOW_DAYS).getTime() < day.getTime() ? lastEnd : previousQuarterEnd(addDays(lastEnd, -1));
  const deadline = addDays(dueQuarter, PAYOUT_WINDOW_DAYS);

  const published = book.publicationDate ? new Date(book.publicationDate) : null;
  if (!published || isNaN(published.getTime()) || published.getTime() > dueQuarter.getTime()) return 0;

  const lastPaid = book.lastRoyaltyPayoutDate ? new Date(book.lastRoyaltyPayoutDate) : null;
  if (lastPaid && !isNaN(lastPaid.getTime()) && lastPaid.getTime() > dueQuarter.getTime()) return 0;

  return Math.floor((day.getTime() - deadline.getTime()) / DAY_MS);
}

/** Indian digit grouping: 1234567 -> "₹12,34,567". */
export function formatINR(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return 'not set';
  const sign = amount < 0 ? '-' : '';
  const digits = String(Math.round(Math.abs(amount)));
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${sign}₹${rest ? `${rest},${last3}` : last3}`;
}

export function formatDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(d.getTime())) return null;
  // Formatted by hand (not Intl) so the output is identical on every machine and locale.
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "PUBLISHED_LIVE" -> "Published Live"; "Published & Live" stays as is. */
export function humanStatus(status: string): string {
  if (status !== status.toUpperCase()) return status;
  return status
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || 'there';
}

/** Plain-text facts about the author's book, given to the model as the only source of numbers. */
export function buildFactsBlock(author: { name: string; city?: string }, book: BookContext | null | undefined, today: Date = new Date()): string {
  const payout = nextPayoutDate(today);
  const lines = [
    `Today: ${formatDate(today)}`,
    `Author: ${author.name}${author.city ? ` (${author.city})` : ''}`,
    `Next royalty payout: for the ${payout.quarterLabel} quarter (ended ${formatDate(payout.quarterEnd)}), paid by ${formatDate(payout.payoutBy)}`,
  ];
  if (!book) {
    lines.push('Book: none linked to this ticket');
    return lines.join('\n');
  }
  lines.push(
    `Book: "${book.title}"`,
    `ISBN on record: ${book.isbn}`,
    `Production status: ${humanStatus(book.status)}`,
  );
  if (book.publicationDate) lines.push(`Publication date: ${formatDate(book.publicationDate)}`);
  lines.push(
    `MRP: ${book.mrp != null ? formatINR(book.mrp) : 'not set yet (book still in production)'}`,
    `Copies sold (all platforms): ${book.totalCopiesSold}`,
    `Royalty earned to date: ${formatINR(book.totalRoyaltyEarned)}`,
    `Royalty paid: ${formatINR(book.royaltyPaid)}`,
    `Royalty pending: ${formatINR(book.royaltyPending)}`,
    `Last royalty payout: ${formatDate(book.lastRoyaltyPayoutDate) ?? 'none yet'}`,
  );
  if (book.authorRoyaltyPerCopy != null) lines.push(`Author royalty per copy (average): ${formatINR(book.authorRoyaltyPerCopy)}`);
  if (book.printPartner) lines.push(`Print partner: ${book.printPartner}`);
  lines.push(`Available on: ${book.availableOn.length ? book.availableOn.join(', ') : 'not listed yet'}`);
  const overdue = royaltyOverdueDays(book, today);
  if (overdue > 0) lines.push(`ROYALTY CHECK: a payout appears ${overdue} days past its deadline. Treat as BookLeaf's fault and escalate.`);
  return lines.join('\n');
}
