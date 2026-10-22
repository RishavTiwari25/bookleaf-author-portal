// Fallback mode: used when there is no API key, the API fails, or the model returns junk.
// 1) A keyword/regex classifier with explicit priority rules.
// 2) Per-category reply templates filled with the author's real book data.

import { firstName, formatDate, formatINR, humanStatus, nextPayoutDate, royaltyOverdueDays, MIN_PAYOUT_INR } from './facts';
import type { Category, Classification, DraftContext, Priority, TicketContext } from './types';

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

// Each rule adds `weight` to a category when its pattern matches the ticket text.
const CATEGORY_RULES: { category: Category; pattern: RegExp; weight: number }[] = [
  { category: 'ROYALTY_PAYMENTS', pattern: /royalt/i, weight: 3 },
  { category: 'ROYALTY_PAYMENTS', pattern: /\b(payout|payment|paid|bank (account|details)|earnings?|money|inr)\b|₹|\brs\.?\s?\d/i, weight: 2 },
  { category: 'ROYALTY_PAYMENTS', pattern: /\b(sold|copies sold|sales)\b/i, weight: 1 },

  { category: 'ISBN_METADATA', pattern: /\bisbn\b/i, weight: 4 },
  { category: 'ISBN_METADATA', pattern: /\b(imprint|metadata|wrong book linked|wrong author name)\b/i, weight: 2 },

  { category: 'PRINTING_QUALITY', pattern: /\b(blurr?y|misprint|misalign|binding|smudge|faded|torn|pages? (are |is )?(missing|upside|out of order)|colou?r (issue|inconsisten|mismatch|wrong)|print(ing)? (quality|defect|issue|error)|defect|damaged|low.?quality)/i, weight: 4 },
  { category: 'PRINTING_QUALITY', pattern: /\b(printed|print order|author copies|reprint|printing)\b/i, weight: 1 },

  { category: 'DISTRIBUTION_AVAILABILITY', pattern: /\b(currently unavailable|unavailable|out of stock|not available|not (showing|visible|listed)|can'?t (find|buy)|cannot (find|buy)|removed from|listing (is )?(gone|missing))/i, weight: 4 },
  { category: 'DISTRIBUTION_AVAILABILITY', pattern: /\b(amazon|flipkart|bookleaf store|distribution|listing)\b/i, weight: 1 },

  { category: 'BOOK_STATUS_PRODUCTION', pattern: /\b(typesetting|proofread|cover design|editing stage|production|manuscript|proof|stage|stuck|status of my book|when will my book)\b/i, weight: 3 },
  { category: 'BOOK_STATUS_PRODUCTION', pattern: /\b(\d+|two|three|four|several) (weeks?|days)\b|\b(delay|delayed|taking (so )?long)\b/i, weight: 1 },

  { category: 'GENERAL_INQUIRY', pattern: /\b(update|change|edit|modify)\b.{0,40}\b(description|blurb|bio|keywords?|author photo|synopsis)\b/i, weight: 5 },
  { category: 'GENERAL_INQUIRY', pattern: /^\s*(can i|how (do|can) i|is it possible|what is|what are|do you)\b/i, weight: 1 },
  { category: 'GENERAL_INQUIRY', pattern: /\b(package|bestseller breakthrough|standard free|how to)\b/i, weight: 1 },
];

// Order used to break ties: more specific / more costly-to-miss categories first.
const TIE_BREAK: Category[] = [
  'ISBN_METADATA',
  'ROYALTY_PAYMENTS',
  'PRINTING_QUALITY',
  'DISTRIBUTION_AVAILABILITY',
  'BOOK_STATUS_PRODUCTION',
  'GENERAL_INQUIRY',
];

export function heuristicCategory(text: string): Category {
  const scores = new Map<Category, number>();
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(text)) scores.set(rule.category, (scores.get(rule.category) ?? 0) + rule.weight);
  }
  let best: Category = 'GENERAL_INQUIRY';
  let bestScore = 0;
  for (const category of TIE_BREAK) {
    const score = scores.get(category) ?? 0;
    if (score > bestScore) {
      best = category;
      bestScore = score;
    }
  }
  return best;
}

const WORD_NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };

/** Largest "N months" mentioned (also "a year" = 12). 0 if none. */
export function monthsMentioned(text: string): number {
  let max = /\b(a|one|over a|more than a) year\b|\b\d+ years?\b/i.test(text) ? 12 : 0;
  for (const m of text.matchAll(/\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\+?\s*months?\b/gi)) {
    const raw = m[1].toLowerCase();
    const n = WORD_NUMBERS[raw] ?? Number(raw);
    if (n > max) max = n;
  }
  return max;
}

const LEGAL = /\b(lawyer|legal (action|notice)|lawsuit|sue|court|consumer forum|copyright infringement|plagiari[sz]|fraud|cheat(ed|ing)?)\b/i;
const NOT_RECEIVED = /\b(not (yet )?(received|got|been paid|paid)|haven'?t (received|got|been paid)|never (received|got|paid)|no (royalty|payment|payout)|missing (royalty|payment)|overdue|still waiting|didn'?t (receive|get))/i;
const ISBN_ERROR = /\b(wrong|incorrect|different|duplicate|mismatch|another book|same isbn|two books)\b/i;
const LIVE_STORE = /\b(amazon|flipkart|live|listing|store)\b/i;
const MANY_AFFECTED = /\b(all (my|of my) books|multiple books|every book|many authors|other authors|all authors)\b/i;
const URGENT = /\b(urgent|asap|immediately|launch event|book launch)\b/i;
// "Why is my royalty this amount?" questions: the author was paid but wants the maths explained.
const AMOUNT_QUESTION = /\b(how (is|was|are|do|does) .{0,30}(calculat|comput)|why .{0,30}(low|less|little)|explain|calculation|breakdown|too (low|little)|so (low|little)|only (got|received)|less than (expected|i expected))/i;

export function heuristicPriority(category: Category, text: string, ctx?: TicketContext): Priority {
  const months = monthsMentioned(text);
  const overdueDays = category === 'ROYALTY_PAYMENTS' ? royaltyOverdueDays(ctx?.book) : 0;

  // CRITICAL: legal risk, money long overdue, wrong/duplicate ISBN that is live, or wide impact.
  if (LEGAL.test(text) || MANY_AFFECTED.test(text)) return 'CRITICAL';
  if (category === 'ROYALTY_PAYMENTS' && NOT_RECEIVED.test(text) && months >= 6) return 'CRITICAL';
  if (category === 'ROYALTY_PAYMENTS' && overdueDays >= 90) return 'CRITICAL';
  if (category === 'ISBN_METADATA' && /\b(duplicate|same isbn|two books)\b/i.test(text)) return 'CRITICAL';
  if (category === 'ISBN_METADATA' && ISBN_ERROR.test(text) && LIVE_STORE.test(text)) return 'CRITICAL';

  // HIGH: something is wrong and BookLeaf has to act.
  if (category === 'ROYALTY_PAYMENTS' && (NOT_RECEIVED.test(text) || overdueDays > 0)) return 'HIGH';
  if (category === 'ISBN_METADATA' && ISBN_ERROR.test(text)) return 'HIGH';
  if (category === 'PRINTING_QUALITY') return 'HIGH';
  if (category === 'DISTRIBUTION_AVAILABILITY') return 'HIGH';
  if (URGENT.test(text)) return 'HIGH';

  // MEDIUM: status, timeline and "how was this calculated" questions.
  if (category === 'BOOK_STATUS_PRODUCTION') return months >= 2 ? 'HIGH' : 'MEDIUM';
  if (category === 'ROYALTY_PAYMENTS' || category === 'ISBN_METADATA') return 'MEDIUM';

  // LOW: general how-to and metadata edits.
  return 'LOW';
}

export function fallbackClassify(ctx: TicketContext): Classification {
  const text = `${ctx.subject}\n${ctx.description}`;
  const category = heuristicCategory(text);
  const priority = heuristicPriority(category, text, ctx);
  return { category, priority, source: 'FALLBACK', reasoning: 'Keyword-based classification (AI unavailable).' };
}

// ---------------------------------------------------------------------------
// Draft templates
// ---------------------------------------------------------------------------

const SIGN_OFF = 'Warm regards,\nBookLeaf Author Support';

/** ["A", "B", "C"] -> "A, B and C" */
function joinList(items: string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function bookRef(ctx: DraftContext): string {
  return ctx.book ? `"${ctx.book.title}"` : 'your book';
}

function royaltyTemplate(ctx: DraftContext, today: Date): string[] {
  const b = ctx.book;
  const payout = nextPayoutDate(today);
  const nextLine = `Royalties are calculated every quarter and paid within 45 days of the quarter ending, so the next payout (for ${payout.quarterLabel}) is due by ${formatDate(payout.payoutBy)}.`;
  const text = `${ctx.subject} ${ctx.description}`;

  // "Why is my royalty so low?" style question.
  if (AMOUNT_QUESTION.test(text) && !NOT_RECEIVED.test(text)) {
    return [
      `Thank you for asking about the royalty on ${bookRef(ctx)}. It's a fair question, and we want the numbers to be fully transparent.`,
      `Your royalty is 80% of the net profit on each copy. Net profit is the MRP${b?.mrp != null ? ` (${formatINR(b.mrp)})` : ''} minus the printing cost, the platform's commission (Amazon or Flipkart) and shipping, so the amount per copy varies by platform.` +
        (b
          ? ` So far ${b.totalCopiesSold} copies have earned you ${formatINR(b.totalRoyaltyEarned)}` +
            (b.royaltyPending > 0 ? `, of which ${formatINR(b.royaltyPaid)} has been paid and ${formatINR(b.royaltyPending)} is pending.` : `, all of which has been paid.`)
          : ''),
      `Your dashboard shows sales per platform, and we'd be glad to send you a line-by-line breakdown. We'll email it to you within 48 hours.`,
    ];
  }

  const overdue = royaltyOverdueDays(b, today);
  if (overdue > 0 && b) {
    return [
      `I'm sorry you've had to chase this. You have ${formatINR(b.royaltyPending)} pending for ${bookRef(ctx)}, and that payout is past our 45-day window. That's on us, not you.`,
      `I've escalated this to our finance team today, and you'll hear back with a confirmed transfer date within 48 hours.`,
      `In the meantime, please check that your bank account is linked in your dashboard so nothing holds up the transfer.`,
    ];
  }

  return [
    `I understand how frustrating it is to wait for your royalty on ${bookRef(ctx)}, and I'm glad you asked.`,
    nextLine + ` Payouts go out once the balance reaches ${formatINR(MIN_PAYOUT_INR)}; smaller amounts roll over to the next quarter.` +
      (b ? ` Right now you have ${formatINR(b.royaltyPending)} pending, and your last payout was ${formatDate(b.lastRoyaltyPayoutDate) ?? 'not yet made'}.` : ''),
    `Please make sure your bank account is linked in your dashboard. If anything looks wrong after checking, reply here and we'll escalate it to finance with an update within 48 hours.`,
  ];
}

function isbnTemplate(ctx: DraftContext): string[] {
  const b = ctx.book;
  return [
    `Thank you for flagging this. An ISBN mismatch on ${bookRef(ctx)} is a serious data issue, and I'm sorry it reached you before we caught it.`,
    `${b ? `The ISBN on our records is ${b.isbn}. ` : ''}I've escalated this to our production team as a priority. They will check the listing and the printed files and update you within 48 hours with what went wrong and the fix.`,
    `If you have a screenshot of the listing or a photo of the copyright page, please reply with it; it will help us correct the platform data faster.`,
  ];
}

function printingTemplate(ctx: DraftContext): string[] {
  return [
    `I'm really sorry the printed copies of ${bookRef(ctx)} didn't meet the standard you expected. Your book deserves better, and we'll put it right.`,
    `Could you reply with a few clear photos of the affected pages (and the cover or binding if relevant)? Once our quality team verifies the issue, we'll reprint the copies free of charge.`,
    `Reprints take 5-7 business days from confirmation, and we'll share the dispatch details as soon as they ship.`,
  ];
}

function distributionTemplate(ctx: DraftContext): string[] {
  const where = ctx.book?.availableOn.length ? ` Your book is set up on ${joinList(ctx.book.availableOn)}.` : '';
  return [
    `Thank you for letting us know. I understand how worrying it is to see ${bookRef(ctx)} marked unavailable when readers are looking for it.`,
    `This is usually a stock sync issue between our system and the platform, not a problem with your book.${where}`,
    `We're triggering a re-sync now, and the listing should be back within 24-48 hours. If it still shows unavailable after that, reply here and we'll escalate it with the platform directly.`,
  ];
}

function productionTemplate(ctx: DraftContext): string[] {
  const status = ctx.book ? humanStatus(ctx.book.status) : null;
  return [
    `Thank you for checking in, and I'm sorry the wait on ${bookRef(ctx)} has been longer than you hoped.`,
    `${status ? `Your book is currently at the ${status} stage. ` : ''}Delays at this point usually come from a pending approval or a revision round, and we should have told you sooner.`,
    `I've asked the production team to confirm exactly what is pending and share an updated timeline with you within 48 hours. If anything is waiting on you, we'll say so clearly so we can move it forward together.`,
  ];
}

function generalTemplate(ctx: DraftContext): string[] {
  const text = `${ctx.subject} ${ctx.description}`;
  if (/\b(description|blurb|bio|keywords?|synopsis)\b/i.test(text)) {
    return [
      `Thanks for reaching out about ${bookRef(ctx)}.`,
      `Yes, you can update your book description after it's live. Just make the change from your dashboard, or reply to this email with the new text, and we'll submit it to the platforms. Updates usually show on Amazon and the other stores within 3-5 business days.`,
      `Once you send it over, we'll confirm when it has been submitted.`,
    ];
  }
  return [
    `Thanks for reaching out about ${bookRef(ctx)}. We've received your question and a member of our team is looking into it.`,
    `We'll reply with a full answer within 48 hours. If there's anything you'd like to add in the meantime, just reply to this message.`,
  ];
}

export function fallbackDraft(ctx: DraftContext, today: Date = new Date()): string {
  const bodyByCategory: Record<Category, () => string[]> = {
    ROYALTY_PAYMENTS: () => royaltyTemplate(ctx, today),
    ISBN_METADATA: () => isbnTemplate(ctx),
    PRINTING_QUALITY: () => printingTemplate(ctx),
    DISTRIBUTION_AVAILABILITY: () => distributionTemplate(ctx),
    BOOK_STATUS_PRODUCTION: () => productionTemplate(ctx),
    GENERAL_INQUIRY: () => generalTemplate(ctx),
  };
  const paragraphs = bodyByCategory[ctx.category]();
  return [`Hi ${firstName(ctx.author.name)},`, ...paragraphs, SIGN_OFF].join('\n\n');
}
