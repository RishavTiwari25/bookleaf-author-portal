import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Replace only the SDK client class so no test ever reaches the network. ApiError and
// ThinkingLevel stay real, so the provider's instanceof checks and enum values are exercised.
const generateContent = vi.fn();
vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>();
  class FakeGoogleGenAI {
    models = { generateContent };
    constructor(public readonly options: unknown) {}
  }
  return { ...actual, GoogleGenAI: FakeGoogleGenAI };
});

import { ApiError } from '@google/genai';
import { aiModel, aiProvider, callModel } from '../../src/ai/client';
import { _clearAiCaches, aiStatus, classifyTicket, draftResponse } from '../../src/ai';
import { ticket } from './fixtures';

const printingTicket = ticket('Print quality problem', 'The images in my printed copies are blurry and some pages are misaligned.');

/** Shape of a Gemini generateContent response, reduced to the fields the provider reads. */
function geminiReply(text: string, finishReason = 'STOP') {
  return {
    text,
    candidates: [{ finishReason }],
    usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 30, thoughtsTokenCount: 10 },
  };
}

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

beforeEach(() => {
  _clearAiCaches();
  generateContent.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  setEnv({ GEMINI_API_KEY: '', ANTHROPIC_API_KEY: '', AI_PROVIDER: 'auto', GEMINI_MODEL: undefined });
  vi.restoreAllMocks();
});

describe('provider selection', () => {
  it('auto picks Gemini when only GEMINI_API_KEY is set', () => {
    setEnv({ GEMINI_API_KEY: 'g-key', ANTHROPIC_API_KEY: '' });
    expect(aiProvider()).toBe('gemini');
    expect(aiStatus()).toEqual({ enabled: true, provider: 'gemini', model: 'gemini-3.5-flash-lite' });
  });

  it('auto prefers Gemini when both keys are set', () => {
    setEnv({ GEMINI_API_KEY: 'g-key', ANTHROPIC_API_KEY: 'a-key' });
    expect(aiProvider()).toBe('gemini');
  });

  it('auto falls back to Anthropic when only ANTHROPIC_API_KEY is set', () => {
    setEnv({ GEMINI_API_KEY: '', ANTHROPIC_API_KEY: 'a-key' });
    expect(aiStatus()).toEqual({ enabled: true, provider: 'anthropic', model: 'claude-haiku-5-5' });
  });

  it('AI_PROVIDER=anthropic wins over an available Gemini key', () => {
    setEnv({ GEMINI_API_KEY: 'g-key', ANTHROPIC_API_KEY: 'a-key', AI_PROVIDER: 'anthropic' });
    expect(aiProvider()).toBe('anthropic');
  });

  it('AI_PROVIDER=gemini without a Gemini key is disabled, not silently Anthropic', () => {
    setEnv({ GEMINI_API_KEY: '', ANTHROPIC_API_KEY: 'a-key', AI_PROVIDER: 'gemini' });
    expect(aiStatus()).toEqual({ enabled: false, provider: 'none', model: null });
  });

  it('no keys means fallback mode', () => {
    setEnv({ GEMINI_API_KEY: '', ANTHROPIC_API_KEY: '' });
    expect(aiStatus()).toEqual({ enabled: false, provider: 'none', model: null });
  });

  it('GEMINI_MODEL overrides the default model', () => {
    setEnv({ GEMINI_API_KEY: 'g-key', GEMINI_MODEL: 'gemini-2.5-flash' });
    expect(aiModel()).toBe('gemini-2.5-flash');
  });
});

describe('callModel via Gemini (mocked SDK)', () => {
  beforeEach(() => setEnv({ GEMINI_API_KEY: 'g-key' }));

  it('sends JSON mode for classification and maps the response', async () => {
    generateContent.mockResolvedValue(geminiReply('{"category":"PRINTING_QUALITY","priority":"HIGH","reasoning":"Defects."}'));
    const result = await callModel({ purpose: 'classify', system: 'sys', userMessage: 'ticket', maxTokens: 150 });

    expect(result).toEqual({
      text: '{"category":"PRINTING_QUALITY","priority":"HIGH","reasoning":"Defects."}',
      model: 'gemini-3.5-flash-lite',
      stopReason: 'end_turn',
      inputTokens: 120,
      outputTokens: 40, // candidates + thoughts
    });
    const call = generateContent.mock.calls[0][0];
    expect(call.model).toBe('gemini-3.5-flash-lite');
    expect(call.contents).toBe('ticket');
    expect(call.config).toMatchObject({
      systemInstruction: 'sys',
      responseMimeType: 'application/json',
      temperature: 0.2,
    });
    expect(call.config.maxOutputTokens).toBeGreaterThanOrEqual(150);
    expect(call.config.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('sends plain text for drafts and normalises MAX_TOKENS', async () => {
    generateContent.mockResolvedValue(geminiReply('Hi Priya, we are sorry about', 'MAX_TOKENS'));
    const result = await callModel({ purpose: 'draft', system: 'sys', userMessage: 'ticket', maxTokens: 500 });
    expect(result.stopReason).toBe('max_tokens');
    expect(generateContent.mock.calls[0][0].config.responseMimeType).toBe('text/plain');
  });

  it('throws when the model returns no text (e.g. safety block)', async () => {
    generateContent.mockResolvedValue({ candidates: [], promptFeedback: { blockReason: 'SAFETY' } });
    await expect(callModel({ purpose: 'draft', system: 's', userMessage: 'u', maxTokens: 10 })).rejects.toThrow(/SAFETY/);
  });

  it('retries a 429 exactly once, then gives up', async () => {
    generateContent.mockRejectedValue(new ApiError({ status: 429, message: 'quota exceeded' }));
    await expect(callModel({ purpose: 'classify', system: 's', userMessage: 'u', maxTokens: 10 })).rejects.toThrow('quota exceeded');
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 400', async () => {
    generateContent.mockRejectedValue(new ApiError({ status: 400, message: 'bad request' }));
    await expect(callModel({ purpose: 'classify', system: 's', userMessage: 'u', maxTokens: 10 })).rejects.toThrow('bad request');
    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});

describe('end to end through the AI module', () => {
  beforeEach(() => setEnv({ GEMINI_API_KEY: 'g-key' }));

  it('classifies a ticket from Gemini JSON', async () => {
    generateContent.mockResolvedValue(geminiReply('{"category":"PRINTING_QUALITY","priority":"HIGH","reasoning":"Defective copies."}'));
    const r = await classifyTicket(printingTicket);
    expect(r).toEqual({ category: 'PRINTING_QUALITY', priority: 'HIGH', source: 'AI', reasoning: 'Defective copies.' });
  });

  it('free-tier 429 degrades to the fallback classifier and template draft', async () => {
    generateContent.mockRejectedValue(new ApiError({ status: 429, message: 'RESOURCE_EXHAUSTED' }));
    const r = await classifyTicket(printingTicket);
    expect(r).toMatchObject({ category: 'PRINTING_QUALITY', priority: 'HIGH', source: 'FALLBACK' });
    const d = await draftResponse({ ...printingTicket, category: r.category, priority: r.priority });
    expect(d.source).toBe('FALLBACK');
    expect(d.body).toContain('Hi Priya,');
  });

  it('records the Gemini model and token counts on an AI draft', async () => {
    generateContent.mockResolvedValue(
      geminiReply('Hi Priya,\n\nWe are sorry about the blurry pages. Please send photos and we will reprint.\n\nWarm regards,\nBookLeaf Author Support'),
    );
    const d = await draftResponse({ ...printingTicket, category: 'PRINTING_QUALITY', priority: 'HIGH' });
    expect(d).toMatchObject({ source: 'AI', model: 'gemini-3.5-flash-lite', inputTokens: 120, outputTokens: 40 });
  });
});
