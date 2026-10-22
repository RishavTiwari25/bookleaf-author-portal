// Google Gemini provider via the official @google/genai SDK. Same contract as the Anthropic
// provider: lazy client, our own timeout + one retry, token/cost logging, throws on failure.

import { ApiError, GoogleGenAI, ThinkingLevel } from '@google/genai';
import { logUsage, withTimeoutAndRetry } from './shared';
import type { AiRequest, AiResult } from './shared';

// Free-tier model that is open to new API keys (Google restricts the 2.5 family to existing users).
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';

// Low randomness: classification must be stable and drafts should stick to the facts block.
// (Gemini 3.6+ ignores temperature; it is harmless there.)
const TEMPERATURE = 0.2;

// Gemini counts "thinking" tokens inside maxOutputTokens. We ask for low thinking and leave
// headroom so a 150-token classification is never cut off by the model's own reasoning.
const THINKING_HEADROOM_TOKENS = 1024;

export function geminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

let client: GoogleGenAI | null = null;
let clientKey: string | null = null;

/** Created on first use, and only when a key exists. Never constructed in FALLBACK mode. */
function getClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return null;
  if (!client || clientKey !== key) {
    // attempts: 1 switches off the SDK's built-in retries (5 by default, with long backoff);
    // withTimeoutAndRetry does our single quick retry instead.
    client = new GoogleGenAI({ apiKey: key, httpOptions: { retryOptions: { attempts: 1 } } });
    clientKey = key;
  }
  return client;
}

/** Retry only rate limits (the free tier's 429) and server errors. Timeouts/aborts are not retried. */
function isRetryable(err: unknown): boolean {
  if (err instanceof ApiError) return err.status === 429 || err.status >= 500;
  return false;
}

/** Returns a description only for errors that came from this SDK; client.ts handles the rest. */
export function describeGeminiError(err: unknown): string | null {
  return err instanceof ApiError ? `${err.status} ${err.message}` : null;
}

/** Gemini's finishReason -> the Anthropic-style value index.ts already understands. */
function normaliseStopReason(finishReason: string | undefined): string | null {
  if (!finishReason) return null;
  if (finishReason === 'STOP') return 'end_turn';
  if (finishReason === 'MAX_TOKENS') return 'max_tokens';
  return finishReason.toLowerCase();
}

/** Calls Gemini once (plus one retry on 429/5xx). Throws on failure; index.ts catches and falls back. */
export async function callGemini(req: AiRequest): Promise<AiResult> {
  const gemini = getClient();
  if (!gemini) throw new Error('AI disabled: GEMINI_API_KEY is not set');
  const model = geminiModel();

  return withTimeoutAndRetry(req.purpose, isRetryable, (err) => describeGeminiError(err) ?? String(err), async (signal) => {
    const started = Date.now();
    const response = await gemini.models.generateContent({
      model,
      contents: req.userMessage,
      config: {
        systemInstruction: req.system,
        maxOutputTokens: req.maxTokens + THINKING_HEADROOM_TOKENS,
        temperature: TEMPERATURE,
        // JSON mode guarantees parseable output for classification; drafts are plain text.
        responseMimeType: req.purpose === 'classify' ? 'application/json' : 'text/plain',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        abortSignal: signal,
      },
    });

    const candidate = response.candidates?.[0];
    const finishReason = candidate?.finishReason ? String(candidate.finishReason) : undefined;
    // response.text joins the text parts of the first candidate and skips thought parts.
    const text = (response.text ?? '').trim();
    if (!text) {
      const why = response.promptFeedback?.blockReason ?? finishReason ?? 'no candidates';
      throw new Error(`Model returned no text (${String(why)})`);
    }

    const usage = response.usageMetadata;
    const inputTokens = usage?.promptTokenCount ?? 0;
    // Thought tokens are billed as output too, so they count towards the cost line.
    const outputTokens = (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0);
    logUsage(req.purpose, 'gemini', model, inputTokens, outputTokens, Date.now() - started);
    return { text, model, stopReason: normaliseStopReason(finishReason), inputTokens, outputTokens };
  });
}
