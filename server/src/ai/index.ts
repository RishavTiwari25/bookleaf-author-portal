// Public AI module. Everything exported here NEVER throws: if Claude is off, slow, failing or
// returns something unusable, we fall back to the keyword classifier / template drafts.

import { aiEnabled, aiModel, callClaude, describeError } from './client';
import { cacheKey, TtlLruCache } from './cache';
import { fallbackClassify, fallbackDraft } from './fallback';
import { buildClassifyUserMessage, buildDraftSystemPrompt, buildDraftUserMessage, CLASSIFY_SYSTEM_PROMPT, MAX_THREAD_MESSAGES } from './prompts';
import { CATEGORIES, CATEGORY_LABELS, isCategory, isPriority } from './types';
import type { Category, Classification, Draft, DraftContext, Priority, TicketContext } from './types';

export * from './types';
export { nextPayoutDate } from './facts';

const CLASSIFY_MAX_TOKENS = 150;
const DRAFT_MAX_TOKENS = 500;

// Only successful AI results are cached; fallbacks are free to recompute.
const classificationCache = new TtlLruCache<Classification>(500);
const draftCache = new TtlLruCache<Draft>(200);

export function aiStatus(): { enabled: boolean; model: string } {
  return { enabled: aiEnabled(), model: aiModel() };
}

// ---------------------------------------------------------------------------
// Parsing / validation of the model's classification JSON
// ---------------------------------------------------------------------------

/** Accepts the enum value or its human label, in any case ("Royalty & Payments" -> ROYALTY_PAYMENTS). */
function normaliseCategory(value: unknown): Category | null {
  if (typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (isCategory(upper)) return upper;
  const byLabel = CATEGORIES.find((c) => CATEGORY_LABELS[c].toLowerCase() === value.trim().toLowerCase());
  return byLabel ?? null;
}

function normalisePriority(value: unknown): Priority | null {
  if (typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase();
  return isPriority(upper) ? upper : null;
}

/**
 * Pull the first {...} object out of the model text (tolerates code fences or stray prose),
 * then validate both enums. Returns null if anything is off, so the caller can fall back.
 */
export function parseClassification(text: string): Omit<Classification, 'source'> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let data: unknown;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  const category = normaliseCategory(obj.category);
  const priority = normalisePriority(obj.priority);
  if (!category || !priority) return null;
  const reasoning = typeof obj.reasoning === 'string' ? obj.reasoning.trim().slice(0, 300) : undefined;
  return { category, priority, reasoning };
}

// ---------------------------------------------------------------------------
// Draft validation
// ---------------------------------------------------------------------------

const PLACEHOLDER = /\[[A-Za-z][^\]\n]{0,40}\]|\{\{|\{[a-z_]+\}|<[A-Z_ ]{3,}>/;

/** Reject drafts that would embarrass us if an admin clicked "send" without reading. */
export function isUsableDraft(text: string, stopReason: string | null): boolean {
  if (!text || text.length < 40) return false;
  if (stopReason === 'max_tokens') return false; // cut off mid-sentence
  if (PLACEHOLDER.test(text)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function classifyTicket(ctx: TicketContext): Promise<Classification> {
  try {
    if (!aiEnabled()) return fallbackClassify(ctx);

    const key = cacheKey('classify', aiModel(), ctx.ticketId ?? null, ctx.subject, ctx.description);
    const cached = classificationCache.get(key);
    if (cached) return cached;

    const result = await callClaude({
      purpose: 'classify',
      system: CLASSIFY_SYSTEM_PROMPT,
      userMessage: buildClassifyUserMessage(ctx),
      maxTokens: CLASSIFY_MAX_TOKENS,
    });
    const parsed = parseClassification(result.text);
    if (!parsed) {
      console.warn('[ai] classify: invalid JSON or enum from model, using fallback');
      return fallbackClassify(ctx);
    }
    const classification: Classification = { ...parsed, source: 'AI' };
    classificationCache.set(key, classification);
    return classification;
  } catch (err) {
    console.warn(`[ai] classify failed (${describeError(err)}), using fallback`);
    return safeFallbackClassify(ctx);
  }
}

export async function draftResponse(ctx: DraftContext & { regenerate?: boolean }): Promise<Draft> {
  try {
    if (!aiEnabled()) return { body: fallbackDraft(ctx), source: 'FALLBACK' };

    const recentThread = (ctx.thread ?? []).slice(-MAX_THREAD_MESSAGES);
    const key = cacheKey('draft', aiModel(), ctx.ticketId ?? null, ctx.subject, ctx.description, ctx.category, ctx.priority, recentThread, ctx.book ?? null);
    if (!ctx.regenerate) {
      const cached = draftCache.get(key);
      if (cached) return cached;
    }

    const result = await callClaude({
      purpose: 'draft',
      system: buildDraftSystemPrompt(ctx),
      userMessage: buildDraftUserMessage(ctx),
      maxTokens: DRAFT_MAX_TOKENS,
    });
    if (!isUsableDraft(result.text, result.stopReason)) {
      console.warn('[ai] draft: unusable output from model, using template');
      return { body: fallbackDraft(ctx), source: 'FALLBACK' };
    }
    const draft: Draft = {
      body: result.text,
      source: 'AI',
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    };
    draftCache.set(key, draft);
    return draft;
  } catch (err) {
    console.warn(`[ai] draft failed (${describeError(err)}), using template`);
    return safeFallbackDraft(ctx);
  }
}

// Last line of defence: even the fallback must not throw (e.g. a malformed ctx).
function safeFallbackClassify(ctx: TicketContext): Classification {
  try {
    return fallbackClassify(ctx);
  } catch {
    return { category: 'GENERAL_INQUIRY', priority: 'MEDIUM', source: 'FALLBACK' };
  }
}

function safeFallbackDraft(ctx: DraftContext): Draft {
  try {
    return { body: fallbackDraft(ctx), source: 'FALLBACK' };
  } catch {
    return {
      body: 'Hi,\n\nThank you for reaching out. Our team is looking into this and will reply within 48 hours.\n\nWarm regards,\nBookLeaf Author Support',
      source: 'FALLBACK',
    };
  }
}

/** For tests only. */
export function _clearAiCaches(): void {
  classificationCache.clear();
  draftCache.clear();
}
