// Provider selection. index.ts talks to this file only; the SDK-specific code lives in providers/.
//
//   AI_PROVIDER=gemini     -> Gemini, needs GEMINI_API_KEY
//   AI_PROVIDER=anthropic  -> Claude, needs ANTHROPIC_API_KEY
//   AI_PROVIDER=auto       -> (default) Gemini if GEMINI_API_KEY is set, else Claude if
//                             ANTHROPIC_API_KEY is set, else no provider = FALLBACK mode.

import { anthropicModel, callAnthropic, describeAnthropicError } from './providers/anthropic';
import { callGemini, describeGeminiError, geminiModel } from './providers/gemini';
import type { AiRequest, AiResult } from './providers/shared';

export type { AiRequest, AiResult } from './providers/shared';

export type AiProvider = 'gemini' | 'anthropic';

const hasKey = (name: string): boolean => Boolean(process.env[name]?.trim());

// Env is read on each call (not at import) so tests and late dotenv loading both work.
export function aiProvider(): AiProvider | null {
  const preference = (process.env.AI_PROVIDER ?? 'auto').trim().toLowerCase();
  const gemini = hasKey('GEMINI_API_KEY');
  const anthropic = hasKey('ANTHROPIC_API_KEY');

  if (preference === 'gemini') return gemini ? 'gemini' : null;
  if (preference === 'anthropic') return anthropic ? 'anthropic' : null;
  if (preference !== 'auto') console.warn(`[ai] unknown AI_PROVIDER "${preference}", treating it as auto`);
  if (gemini) return 'gemini';
  if (anthropic) return 'anthropic';
  return null;
}

export function aiEnabled(): boolean {
  return aiProvider() !== null;
}

/** The model the selected provider will use, or null in FALLBACK mode. */
export function aiModel(): string | null {
  const provider = aiProvider();
  if (provider === 'gemini') return geminiModel();
  if (provider === 'anthropic') return anthropicModel();
  return null;
}

/** One entry point for both call shapes (classify -> JSON, draft -> text). Throws on failure. */
export async function callModel(req: AiRequest): Promise<AiResult> {
  const provider = aiProvider();
  if (provider === 'gemini') return callGemini(req);
  if (provider === 'anthropic') return callAnthropic(req);
  throw new Error('AI disabled: no API key configured');
}

export function describeError(err: unknown): string {
  const fromSdk = describeAnthropicError(err) ?? describeGeminiError(err);
  if (fromSdk) return fromSdk;
  if (err instanceof Error) return err.message;
  return String(err);
}
