// Thin wrapper around the Anthropic SDK: lazy client, timeout, one retry, token/cost logging.

import Anthropic from '@anthropic-ai/sdk';

const DEFAULT_MODEL = 'claude-haiku-5-5';
const DEFAULT_TIMEOUT_MS = 15_000;
const RETRY_BACKOFF_MS = 800;

// USD per million tokens (input, output). Used only for the log line's cost estimate.
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
};

// Env is read on each call (not at import) so tests and late dotenv loading both work.
export function aiModel(): string {
  return process.env.AI_MODEL?.trim() || DEFAULT_MODEL;
}

export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

function timeoutMs(): number {
  const n = Number(process.env.AI_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
}

let client: Anthropic | null = null;
let clientKey: string | null = null;

/** Created on first use, and only when a key exists. Never constructed in FALLBACK mode. */
function getClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  if (!client || clientKey !== key) {
    // maxRetries: 0 because we do our own single retry below and want to control timing.
    client = new Anthropic({ apiKey: key, maxRetries: 0 });
    clientKey = key;
  }
  return client;
}

export interface ClaudeRequest {
  purpose: 'classify' | 'draft';
  system: string;
  userMessage: string;
  maxTokens: number;
}

export interface ClaudeResult {
  text: string;
  model: string;
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Model-specific request knobs. Classification and short drafts don't need extended thinking:
 * on Haiku we switch it off so every output token goes into the answer. Models that refuse
 * "disabled" (Opus/Sonnet 5.5) get the lowest effort instead.
 */
function thinkingParams(model: string): Partial<Anthropic.MessageCreateParamsNonStreaming> {
  if (model.startsWith('claude-haiku')) return { thinking: { type: 'disabled' } };
  return { output_config: { effort: 'low' } };
}

function logUsage(purpose: string, model: string, input: number, output: number, ms: number): void {
  const price = PRICING[model];
  const cost = price ? `$${((input * price.input + output * price.output) / 1_000_000).toFixed(6)}` : 'n/a';
  console.info(`[ai] ${purpose} model=${model} in=${input} out=${output} cost~${cost} ${ms}ms`);
}

/** Calls Claude once (plus one retry on 429/5xx). Throws on failure; index.ts catches and falls back. */
export async function callClaude(req: ClaudeRequest): Promise<ClaudeResult> {
  const anthropic = getClient();
  if (!anthropic) throw new Error('AI disabled: ANTHROPIC_API_KEY is not set');
  const model = aiModel();

  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs());
    const started = Date.now();
    try {
      const response = await anthropic.messages.create(
        {
          model,
          max_tokens: req.maxTokens,
          system: req.system,
          messages: [{ role: 'user', content: req.userMessage }],
          ...thinkingParams(model),
        },
        { signal: controller.signal },
      );

      if (response.stop_reason === 'refusal') throw new Error('Model declined the request');
      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('')
        .trim();

      const { input_tokens, output_tokens } = response.usage;
      logUsage(req.purpose, model, input_tokens, output_tokens, Date.now() - started);
      return { text, model, stopReason: response.stop_reason, inputTokens: input_tokens, outputTokens: output_tokens };
    } catch (err) {
      if (attempt === 1 && isRetryable(err)) {
        console.warn(`[ai] ${req.purpose} attempt 1 failed (${describeError(err)}), retrying once`);
        await sleep(RETRY_BACKOFF_MS);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  // Unreachable: the loop either returns or throws.
  throw new Error('callClaude: exhausted attempts');
}

export function describeError(err: unknown): string {
  if (err instanceof Anthropic.APIError) return `${err.status ?? 'network'} ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}
