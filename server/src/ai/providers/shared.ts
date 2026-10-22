// Pieces both providers share: the request/result shape, the timeout + single-retry loop,
// and the usage/cost log line. Each provider only has to turn its SDK response into an AiResult.

/** One model call, as the AI module sees it. The provider decides how to express this in its SDK. */
export interface AiRequest {
  purpose: 'classify' | 'draft';
  system: string;
  userMessage: string;
  maxTokens: number;
}

/** Provider-neutral result. stopReason is normalised: 'end_turn' | 'max_tokens' | anything else. */
export interface AiResult {
  text: string;
  model: string;
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const RETRY_BACKOFF_MS = 800;

// USD per million tokens (input, output). Used only for the log line's cost estimate.
// Gemini numbers are the paid list price; on the free tier the real cost is $0.
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'gemini-3.5-flash-lite': { input: 0.3, output: 2.5 },
  'gemini-3.8-flash': { input: 0.75, output: 3.75 },
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
};

export function timeoutMs(): number {
  const n = Number(process.env.AI_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `attempt` with an AbortController timeout. If it fails and `isRetryable` says the error
 * is transient (429 / 5xx), waits briefly and tries exactly once more. Anything else is thrown
 * straight away, and index.ts turns the throw into a fallback.
 */
export async function withTimeoutAndRetry<T>(
  purpose: string,
  isRetryable: (err: unknown) => boolean,
  describe: (err: unknown) => string,
  attempt: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  for (let n = 1; n <= 2; n++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs());
    try {
      return await attempt(controller.signal);
    } catch (err) {
      if (n === 1 && isRetryable(err)) {
        console.warn(`[ai] ${purpose} attempt 1 failed (${describe(err)}), retrying once`);
        await sleep(RETRY_BACKOFF_MS);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  // Unreachable: the loop either returns or throws.
  throw new Error('withTimeoutAndRetry: exhausted attempts');
}

export function logUsage(purpose: string, provider: string, model: string, input: number, output: number, ms: number): void {
  const price = PRICING[model];
  const cost = price ? `$${((input * price.input + output * price.output) / 1_000_000).toFixed(6)}` : 'n/a';
  console.info(`[ai] ${purpose} provider=${provider} model=${model} in=${input} out=${output} cost~${cost} ${ms}ms`);
}
