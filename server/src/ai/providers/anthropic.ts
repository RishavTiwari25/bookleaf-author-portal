// Anthropic (Claude) provider: lazy client, our own timeout + one retry, token/cost logging.

import Anthropic from '@anthropic-ai/sdk';
import { logUsage, withTimeoutAndRetry } from './shared';
import type { AiRequest, AiResult } from './shared';

export const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-5-5';

export function anthropicModel(): string {
  return process.env.AI_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
}

let client: Anthropic | null = null;
let clientKey: string | null = null;

/** Created on first use, and only when a key exists. Never constructed in FALLBACK mode. */
function getClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  if (!client || clientKey !== key) {
    // maxRetries: 0 because we do our own single retry in withTimeoutAndRetry.
    client = new Anthropic({ apiKey: key, maxRetries: 0 });
    clientKey = key;
  }
  return client;
}

/** Retry only what is likely to succeed a second later: rate limits and server errors. */
function isRetryable(err: unknown): boolean {
  if (err instanceof Anthropic.APIConnectionTimeoutError || err instanceof Anthropic.APIUserAbortError) return false;
  if (err instanceof Anthropic.APIConnectionError) return true;
  if (err instanceof Anthropic.APIError) {
    const status = err.status ?? 0;
    return status === 429 || status >= 500;
  }
  return false;
}

/** Returns a description only for errors that came from this SDK; client.ts handles the rest. */
export function describeAnthropicError(err: unknown): string | null {
  return err instanceof Anthropic.APIError ? `${err.status ?? 'network'} ${err.message}` : null;
}

/**
 * Model-specific request knobs. Classification and short drafts don't need extended thinking:
 * on Haiku we switch it off so every output token goes into the answer. Models that refuse
 * "disabled" (Opus/Sonnet 5.5) get the lowest effort instead.
 */
function thinkingParams(model: string): Partial<Anthropic.MessageCreateParamsNonStreaming> {
  if (model.startsWith('claude-haiku')) return { thinking: { type: 'disabled' } };
  return { output_config: { effort: 'low' } };
}

/** Calls Claude once (plus one retry on 429/5xx). Throws on failure; index.ts catches and falls back. */
export async function callAnthropic(req: AiRequest): Promise<AiResult> {
  const anthropic = getClient();
  if (!anthropic) throw new Error('AI disabled: ANTHROPIC_API_KEY is not set');
  const model = anthropicModel();

  return withTimeoutAndRetry(req.purpose, isRetryable, (err) => describeAnthropicError(err) ?? String(err), async (signal) => {
    const started = Date.now();
    const response = await anthropic.messages.create(
      {
        model,
        max_tokens: req.maxTokens,
        system: req.system,
        messages: [{ role: 'user', content: req.userMessage }],
        ...thinkingParams(model),
      },
      { signal },
    );

    if (response.stop_reason === 'refusal') throw new Error('Model declined the request');
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();

    const { input_tokens, output_tokens } = response.usage;
    logUsage(req.purpose, 'anthropic', model, input_tokens, output_tokens, Date.now() - started);
    return { text, model, stopReason: response.stop_reason, inputTokens: input_tokens, outputTokens: output_tokens };
  });
}
