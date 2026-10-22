import { describe, expect, it } from 'vitest';
import { formatDate, formatINR, nextPayoutDate, royaltyOverdueDays } from '../../src/ai/facts';
import { book } from './fixtures';

const d = (iso: string) => new Date(`${iso}T09:00:00Z`);

describe('nextPayoutDate (quarterly cycle, paid within 45 days)', () => {
  it('inside the window of the last quarter -> that quarter pays next', () => {
    const p = nextPayoutDate(d('2026-10-22'));
    expect(formatDate(p.quarterEnd)).toBe('30 September 2026');
    expect(formatDate(p.payoutBy)).toBe('14 November 2026');
    expect(p.quarterLabel).toBe('Jul-Sep 2026');
  });

  it('after the window closes -> the current quarter pays next', () => {
    const p = nextPayoutDate(d('2026-11-20'));
    expect(formatDate(p.quarterEnd)).toBe('31 December 2026');
    expect(formatDate(p.payoutBy)).toBe('14 February 2027');
  });

  it('handles the year boundary (January belongs to the Oct-Dec payout)', () => {
    const p = nextPayoutDate(d('2027-01-05'));
    expect(p.quarterLabel).toBe('Oct-Dec 2026');
    expect(formatDate(p.payoutBy)).toBe('14 February 2027');
  });

  it('on the quarter end day itself, that quarter is next', () => {
    expect(formatDate(nextPayoutDate(d('2026-03-31')).payoutBy)).toBe('15 May 2026');
  });

  it('on the deadline day, the deadline is still the next payout', () => {
    expect(formatDate(nextPayoutDate(d('2026-08-14')).payoutBy)).toBe('14 August 2026');
    expect(formatDate(nextPayoutDate(d('2026-08-15')).payoutBy)).toBe('14 November 2026');
  });
});

describe('royaltyOverdueDays', () => {
  it('is 0 when nothing is pending', () => {
    expect(royaltyOverdueDays({ ...book, royaltyPending: 0 }, d('2026-10-22'))).toBe(0);
  });

  it('is 0 when pending is below the ₹1,000 minimum', () => {
    expect(royaltyOverdueDays({ ...book, royaltyPending: 800, lastRoyaltyPayoutDate: null }, d('2026-10-22'))).toBe(0);
  });

  it('counts days past the Apr-Jun deadline (14 Aug) when never paid', () => {
    const b = { ...book, royaltyPending: 4200, lastRoyaltyPayoutDate: null, publicationDate: '2026-02-01' };
    expect(royaltyOverdueDays(b, d('2026-10-22'))).toBe(69);
  });

  it('is 0 when paid after the due quarter ended', () => {
    const b = { ...book, royaltyPending: 4200, lastRoyaltyPayoutDate: '2026-08-10', publicationDate: '2026-02-01' };
    expect(royaltyOverdueDays(b, d('2026-10-22'))).toBe(0);
  });

  it('is 0 for a book published after the due quarter', () => {
    const b = { ...book, royaltyPending: 4200, lastRoyaltyPayoutDate: null, publicationDate: '2026-07-15' };
    expect(royaltyOverdueDays(b, d('2026-10-22'))).toBe(0);
  });
});

describe('formatINR', () => {
  it('uses Indian digit grouping', () => {
    expect(formatINR(299)).toBe('₹299');
    expect(formatINR(3000)).toBe('₹3,000');
    expect(formatINR(1234567)).toBe('₹12,34,567');
    expect(formatINR(null)).toBe('not set');
  });
});
