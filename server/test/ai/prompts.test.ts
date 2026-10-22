import { describe, expect, it } from 'vitest';
import { buildDraftSystemPrompt, buildDraftUserMessage, buildClassifyUserMessage, MAX_DESCRIPTION_CHARS } from '../../src/ai/prompts';
import { book, ticket } from './fixtures';

describe('prompt builders', () => {
  it('draft system prompt carries only the relevant KB section plus company and tone', () => {
    const p = buildDraftSystemPrompt({ category: 'PRINTING_QUALITY' });
    expect(p).toContain('PRINTING & QUALITY');
    expect(p).toContain('ABOUT BOOKLEAF');
    expect(p).toContain('TONE AND COMMUNICATION RULES');
    expect(p).not.toContain('ROYALTY & PAYMENTS');
    expect(p).not.toContain('DISTRIBUTION & AVAILABILITY');
  });

  it('draft user message includes real book facts and the next payout date', () => {
    const msg = buildDraftUserMessage(
      { ...ticket('No royalty', 'Still waiting for my royalty.'), category: 'ROYALTY_PAYMENTS', priority: 'HIGH' },
      new Date('2026-10-22T10:00:00Z'),
    );
    expect(msg).toContain('The Monsoon Letters');
    expect(msg).toContain('978-93-5000-123-4');
    expect(msg).toContain('14 November 2026');
    expect(msg).toContain('Copies sold (all platforms): 200');
  });

  it('only the last 4 thread messages are sent', () => {
    const thread = Array.from({ length: 7 }, (_, i) => ({ from: 'AUTHOR' as const, body: `message-${i}` }));
    const msg = buildDraftUserMessage({ ...ticket('Hi', 'Some long question here.'), category: 'GENERAL_INQUIRY', priority: 'LOW', thread });
    expect(msg).not.toContain('message-2');
    expect(msg).toContain('message-3');
    expect(msg).toContain('message-6');
  });

  it('long descriptions are truncated', () => {
    const msg = buildClassifyUserMessage(ticket('Long', 'x'.repeat(10_000)));
    expect(msg.length).toBeLessThan(MAX_DESCRIPTION_CHARS + 600);
    expect(msg).toContain('[truncated]');
  });
});

describe('books still in production', () => {
  it('handles a null MRP without printing "null"', () => {
    const msg = buildDraftUserMessage({
      ...ticket('Status?', 'Where is my book in production?', { ...book, mrp: null, status: 'TYPESETTING', publicationDate: undefined }),
      category: 'BOOK_STATUS_PRODUCTION',
      priority: 'MEDIUM',
    });
    expect(msg).toContain('MRP: not set yet');
    expect(msg).not.toContain('null');
  });
});
