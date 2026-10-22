import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Replace the network layer so no test ever calls the real API.
vi.mock('../../src/ai/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/ai/client')>();
  return { ...actual, callModel: vi.fn() };
});

import { callModel } from '../../src/ai/client';
import { _clearAiCaches, aiStatus, classifyTicket, draftResponse, isUsableDraft, parseClassification } from '../../src/ai';
import { ticket } from './fixtures';

const mockedCall = vi.mocked(callModel);
const reply = (text: string, stopReason: string | null = 'end_turn') => ({
  text,
  stopReason,
  model: 'claude-haiku-5-5',
  inputTokens: 300,
  outputTokens: 40,
});

const printingTicket = ticket('Print quality problem', 'The images in my printed copies are blurry and some pages are misaligned.');

describe('parseClassification', () => {
  it('accepts clean JSON', () => {
    expect(parseClassification('{"category":"ISBN_METADATA","priority":"HIGH","reasoning":"x"}')).toEqual({
      category: 'ISBN_METADATA',
      priority: 'HIGH',
      reasoning: 'x',
    });
  });

  it('tolerates code fences, prose and lower case', () => {
    const text = 'Here you go:\n```json\n{"category":"printing_quality","priority":"high"}\n```';
    expect(parseClassification(text)).toMatchObject({ category: 'PRINTING_QUALITY', priority: 'HIGH' });
  });

  it('maps a human label back to the enum', () => {
    expect(parseClassification('{"category":"Royalty & Payments","priority":"LOW"}')?.category).toBe('ROYALTY_PAYMENTS');
  });

  it.each([
    ['not json at all'],
    ['{"category":"ROYALTY_PAYMENTS"'],
    ['{"category":"REFUNDS","priority":"HIGH"}'],
    ['{"category":"ROYALTY_PAYMENTS","priority":"URGENT"}'],
    ['{"priority":"HIGH"}'],
    ['[]'],
  ])('rejects %s', (text) => {
    expect(parseClassification(text)).toBeNull();
  });
});

describe('isUsableDraft', () => {
  const good = 'Hi Priya,\n\nThanks for flagging this. We will reprint your copies.\n\nWarm regards,\nBookLeaf Author Support';
  it('accepts a normal draft', () => expect(isUsableDraft(good, 'end_turn')).toBe(true));
  it('rejects placeholders', () => expect(isUsableDraft(good.replace('Priya', '[Author Name]'), 'end_turn')).toBe(false));
  it('rejects truncated output', () => expect(isUsableDraft(good, 'max_tokens')).toBe(false));
  it('rejects empty output', () => expect(isUsableDraft('', 'end_turn')).toBe(false));
});

describe('classifyTicket / draftResponse with AI enabled (mocked)', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key-not-real';
    _clearAiCaches();
    mockedCall.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    vi.restoreAllMocks();
  });

  it('uses the AI result when the JSON is valid', async () => {
    mockedCall.mockResolvedValue(reply('{"category":"PRINTING_QUALITY","priority":"HIGH","reasoning":"Defective copies."}'));
    const r = await classifyTicket(printingTicket);
    expect(r).toEqual({ category: 'PRINTING_QUALITY', priority: 'HIGH', source: 'AI', reasoning: 'Defective copies.' });
  });

  it('falls back to heuristics on invalid JSON', async () => {
    mockedCall.mockResolvedValue(reply('Sure! This looks like a printing issue.'));
    const r = await classifyTicket(printingTicket);
    expect(r).toMatchObject({ category: 'PRINTING_QUALITY', priority: 'HIGH', source: 'FALLBACK' });
  });

  it('falls back on an invalid enum value', async () => {
    mockedCall.mockResolvedValue(reply('{"category":"PRINTING","priority":"SEVERE"}'));
    expect((await classifyTicket(printingTicket)).source).toBe('FALLBACK');
  });

  it('never throws when the API call fails', async () => {
    mockedCall.mockRejectedValue(new Error('timeout'));
    await expect(classifyTicket(printingTicket)).resolves.toMatchObject({ source: 'FALLBACK' });
    await expect(draftResponse({ ...printingTicket, category: 'PRINTING_QUALITY', priority: 'HIGH' })).resolves.toMatchObject({
      source: 'FALLBACK',
    });
  });

  it('caches AI classifications so the same ticket is not billed twice', async () => {
    mockedCall.mockResolvedValue(reply('{"category":"PRINTING_QUALITY","priority":"HIGH"}'));
    const t = { ...printingTicket, ticketId: 't1' };
    await classifyTicket(t);
    await classifyTicket(t);
    expect(mockedCall).toHaveBeenCalledTimes(1);
  });

  it('draft cache is bypassed with regenerate', async () => {
    mockedCall.mockResolvedValue(reply('Hi Priya,\n\nWe are sorry about the blurry pages. Please send photos and we will reprint.\n\nWarm regards,\nBookLeaf Author Support'));
    const ctx = { ...printingTicket, ticketId: 't2', category: 'PRINTING_QUALITY' as const, priority: 'HIGH' as const };
    const first = await draftResponse(ctx);
    await draftResponse(ctx);
    await draftResponse({ ...ctx, regenerate: true });
    expect(first.source).toBe('AI');
    expect(mockedCall).toHaveBeenCalledTimes(2);
  });

  it('replaces a draft with placeholders by the template', async () => {
    mockedCall.mockResolvedValue(reply('Hi [Author Name],\n\nWe will look into it.\n\nWarm regards,\nBookLeaf Author Support'));
    const d = await draftResponse({ ...printingTicket, category: 'PRINTING_QUALITY', priority: 'HIGH' });
    expect(d.source).toBe('FALLBACK');
    expect(d.body).toContain('Hi Priya,');
  });
});

describe('without an API key', () => {
  it('reports disabled and never calls the API', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    mockedCall.mockReset();
    expect(aiStatus().enabled).toBe(false);
    const r = await classifyTicket(printingTicket);
    const d = await draftResponse({ ...printingTicket, category: r.category, priority: r.priority });
    expect(r.source).toBe('FALLBACK');
    expect(d.source).toBe('FALLBACK');
    expect(mockedCall).not.toHaveBeenCalled();
  });
});
