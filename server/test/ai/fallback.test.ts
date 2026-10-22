import { describe, expect, it } from 'vitest';
import { fallbackClassify, fallbackDraft, monthsMentioned } from '../../src/ai/fallback';
import type { Category, Priority } from '../../src/ai/types';
import { author, book, ticket } from './fixtures';

// The 7 sample queries from the BookLeaf brief, with the expected category and priority.
const SAMPLES: { subject: string; description: string; category: Category; priority: Priority[] }[] = [
  {
    subject: 'No royalty received yet',
    description: "I published my book 4 months ago and still haven't received any royalty payment. When will I get paid?",
    category: 'ROYALTY_PAYMENTS',
    priority: ['HIGH'],
  },
  {
    subject: 'Royalty amount seems too low',
    description: 'I sold 200 copies but only got ₹3,000 as royalty. That seems too low. How is this calculated?',
    category: 'ROYALTY_PAYMENTS',
    priority: ['MEDIUM'],
  },
  {
    subject: 'ISBN mismatch on Amazon',
    description: 'The ISBN shown on my Amazon listing is different from the one printed on my physical copy.',
    category: 'ISBN_METADATA',
    priority: ['CRITICAL', 'HIGH'],
  },
  {
    subject: 'Print quality problem',
    description: 'The images in my printed copies are blurry and some pages are misaligned.',
    category: 'PRINTING_QUALITY',
    priority: ['HIGH'],
  },
  {
    subject: 'Book unavailable on Amazon',
    description: "My book shows 'Currently Unavailable' on Amazon. Readers are asking me where to buy it.",
    category: 'DISTRIBUTION_AVAILABILITY',
    priority: ['HIGH'],
  },
  {
    subject: 'Stuck in typesetting',
    description: 'My book has been in typesetting for 3 weeks now. When will it move to the next stage?',
    category: 'BOOK_STATUS_PRODUCTION',
    priority: ['MEDIUM'],
  },
  {
    subject: 'Updating my book description',
    description: "Can I update my book description on Amazon after it's live?",
    category: 'GENERAL_INQUIRY',
    priority: ['LOW'],
  },
];

describe('fallbackClassify on the 7 sample queries', () => {
  for (const s of SAMPLES) {
    it(`${s.subject} -> ${s.category}`, () => {
      const result = fallbackClassify(ticket(s.subject, s.description));
      expect(result.source).toBe('FALLBACK');
      expect(result.category).toBe(s.category);
      expect(s.priority).toContain(result.priority);
    });
  }
});

describe('fallback priority escalation', () => {
  it('royalty not received for 6 months is CRITICAL', () => {
    const r = fallbackClassify(ticket('Where is my money', 'I have not received any royalty for 6 months now.'));
    expect(r).toMatchObject({ category: 'ROYALTY_PAYMENTS', priority: 'CRITICAL' });
  });

  it('duplicate ISBN is CRITICAL', () => {
    const r = fallbackClassify(ticket('Duplicate ISBN', 'My book and another author’s book have a duplicate ISBN.'));
    expect(r).toMatchObject({ category: 'ISBN_METADATA', priority: 'CRITICAL' });
  });

  it('legal threat is CRITICAL whatever the category', () => {
    const r = fallbackClassify(ticket('Final warning', 'My book has been stuck in production and I will send a legal notice.'));
    expect(r.priority).toBe('CRITICAL');
  });

  it('book data showing an overdue payout escalates a royalty ticket', () => {
    const overdueBook = { ...book, royaltyPending: 5000, lastRoyaltyPayoutDate: null, publicationDate: '2025-06-01' };
    const r = fallbackClassify(ticket('Royalty question', 'Can you tell me about my royalty?', overdueBook));
    expect(r.category).toBe('ROYALTY_PAYMENTS');
    expect(['HIGH', 'CRITICAL']).toContain(r.priority);
  });

  it('reads written and numeric month counts', () => {
    expect(monthsMentioned('six months')).toBe(6);
    expect(monthsMentioned('for 8 months and 2 months')).toBe(8);
    expect(monthsMentioned('over a year')).toBe(12);
    expect(monthsMentioned('3 weeks')).toBe(0);
  });
});

describe('fallbackDraft', () => {
  const today = new Date('2026-10-22T10:00:00Z');
  const categories: Category[] = [
    'ROYALTY_PAYMENTS',
    'ISBN_METADATA',
    'PRINTING_QUALITY',
    'DISTRIBUTION_AVAILABILITY',
    'BOOK_STATUS_PRODUCTION',
    'GENERAL_INQUIRY',
  ];

  for (const category of categories) {
    it(`${category} template greets the author, names the book and signs off`, () => {
      const body = fallbackDraft({ ...ticket('Help', 'Something about my book needs attention.'), category, priority: 'MEDIUM' }, today);
      expect(body.startsWith('Hi Priya,')).toBe(true);
      expect(body).toContain('The Monsoon Letters');
      expect(body.endsWith('Warm regards,\nBookLeaf Author Support')).toBe(true);
      expect(body).not.toMatch(/\[[A-Za-z][^\]]*\]|\{\{/); // no placeholders
    });
  }

  it('royalty template states the specific next payout date', () => {
    const body = fallbackDraft(
      { ...ticket('No royalty yet', "I haven't received my royalty."), category: 'ROYALTY_PAYMENTS', priority: 'HIGH' },
      today,
    );
    expect(body).toContain('14 November 2026');
  });

  it('royalty "too low" question explains the net profit split with real numbers', () => {
    const body = fallbackDraft(
      { ...ticket('Royalty too low', 'I sold 200 copies but only got ₹3,000. That seems too low.'), category: 'ROYALTY_PAYMENTS', priority: 'MEDIUM' },
      today,
    );
    expect(body).toContain('80%');
    expect(body).toContain('200 copies');
    expect(body).toContain('₹3,000');
  });

  it('works without a linked book', () => {
    const body = fallbackDraft({ ...ticket('Question', 'How do packages work?', null), category: 'GENERAL_INQUIRY', priority: 'LOW' }, today);
    expect(body).toContain(`Hi ${author.name.split(' ')[0]},`);
    expect(body).toContain('your book');
  });
});
