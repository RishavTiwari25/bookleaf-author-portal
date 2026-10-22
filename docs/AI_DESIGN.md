# AI design: classification and response drafts

All the AI code is in `server/src/ai/`. The rest of the app only uses three functions: `classifyTicket`, `draftResponse` and `aiStatus`. None of them ever throws. If anything goes wrong, they fall back to deterministic code, so ticket creation and the admin screen never wait on Claude or break because of it.

## What the AI does

1. **Classification** runs when a ticket is created. It returns a category, a priority and a one-line reason that the admin sees.
2. **Draft response** runs when an admin opens a ticket and asks for a draft. The draft is a starting point. A human always reviews and edits it before anything is sent.

## Prompt strategy

**Classification** is a single call with a fixed system prompt. It has:
- one-line definitions for each of the six categories;
- an explicit priority rubric (CRITICAL = money long overdue, wrong/duplicate ISBN on a live listing, legal threats, many authors affected; HIGH = royalty overdue, ISBN errors, print defects, book unavailable; MEDIUM = status and timeline questions; LOW = how-to questions and metadata edits), plus "if unsure, pick the higher one", because under-prioritising costs more than over-prioritising;
- eight few-shot examples. Seven are the sample queries from the brief, and one is a legal-threat case;
- a strict output contract: return only `{"category","priority","reasoning"}`.

The user message holds the ticket and a one-line book summary. That summary includes "payout appears N days overdue" when the numbers show it, so the model can judge urgency from data and not just from the author's tone.

**Drafts** use a system prompt with the BookLeaf tone rules written as numbered, checkable instructions: acknowledge the concern first, use the exact numbers, own BookLeaf's mistakes, give concrete timelines, end with a next step, no placeholders, under 180 words, and a fixed sign-off. The user message carries an **AUTHOR FACTS** block built in code: ISBN, status, copies sold, royalty earned/paid/pending, last payout, platforms and the **next payout date**. I calculate the payout date in `facts.ts` (quarters end Mar 31 / Jun 30 / Sep 30 / Dec 31, paid within 45 days) and don't ask the model to do date maths. That makes the date both cheaper and correct. The prompt tells the model to use only those facts and never invent amounts, dates or names.

Author text is wrapped in `<ticket>` tags, and the prompt says to treat it as data and ignore any instructions inside it. This is basic prompt-injection hygiene.

## Knowledge base slicing (cost)

The KB in `kb.ts` is split by category. A draft prompt carries only **Company + Tone + that one category's section**, not the whole KB. That keeps the system prompt at roughly 600 tokens instead of about 1,500. Classification doesn't need the KB at all: the category definitions are enough.

Other cost controls:
- descriptions are cut at 2,000 characters;
- only the last 4 thread messages are sent, each capped at 800 characters;
- `max_tokens` is 150 for classification and 500 for drafts;
- extended thinking is switched off on Haiku, because these are short, well-specified tasks.

Every call logs its token counts and an estimated cost, for example `[ai] draft model=claude-haiku-5-5 in=820 out=190 cost~$0.000177`.

## Model choice

The default is **Claude Haiku 5.5** (`AI_MODEL` overrides it). Both tasks are short, well-specified and run often. Haiku is the cheapest and fastest current model ($0.10 / $0.50 per million tokens), and it follows formatting instructions and JSON output reliably. At about 800 input and 200 output tokens per draft, 10,000 drafts cost roughly $2. If draft quality ever needed a step up, switching to Sonnet is a single env-var change.

## Graceful degradation

- **No `ANTHROPIC_API_KEY`:** the Anthropic client is never created. Everything runs in FALLBACK mode, and `/api/health` reports `ai.enabled: false`.
- **Timeouts:** each call has an `AbortController` timeout (`AI_TIMEOUT_MS`, default 15 s).
- **Retries:** 429 and 5xx errors are retried once after a short backoff. Other errors are not retried.
- **Bad classification output:** if the JSON is invalid or a category/priority is not a valid enum value, the result is thrown away and the keyword classifier is used. The parser tolerates code fences and human labels like "Royalty & Payments".
- **Bad draft output:** a draft is rejected if it is empty, was cut off (`max_tokens`), or contains a placeholder like `[Name]`. The template is used instead.
- **Fallback classifier** (`fallback.ts`): weighted keyword rules for each category, plus explicit priority rules. Mentions like "6 months" or "not received", a wrong or duplicate ISBN on a live store, legal words, and "all my books" escalate the priority. Book data also counts: a payout past its 45-day deadline raises a royalty ticket.
- **Fallback drafts:** one template per category, filled with the author's first name, book title, ISBN, status, royalty figures and the computed next payout date. They are written to be good enough to send as they are.

Every result records its `source` (`AI` or `FALLBACK`), and admin overrides are recorded as `MANUAL`. That gives an honest picture of how often each path is used.

## Caching

An in-memory LRU cache with a TTL (500 entries, 1 hour) is keyed by a sha256 of the ticket id, the content, the category/priority and the recent thread. Re-opening a ticket or refreshing the page doesn't call Claude again. `regenerate: true` skips the cache. Only AI results are cached, because fallbacks are free to recompute. The server also stores the latest draft per ticket in the database, so the in-memory cache mainly absorbs repeated clicks and burst traffic.

## What I'd do next

1. **Eval set.** Turn the sample queries and real (anonymised) tickets into a labelled set. Run it in CI against both the AI and the fallback, tracking category accuracy, priority accuracy and a draft rubric (mentions the right date or amount, has a next step, stays under the word limit).
2. **Feedback loop from admin edits.** Store the AI draft and the reply that was actually sent, and track the edit distance and category/priority overrides. Heavily edited drafts and overridden classifications become new few-shot examples and eval cases.
3. **Retrieval once the KB grows.** Slicing by category is enough for a one-page KB. Once there are FAQs, policy documents and past resolved tickets, I'd move to embeddings retrieval (top-k chunks for each ticket) so the prompt size stays flat.
4. **Structured outputs and prompt caching.** Use the API's JSON-schema output mode for classification to guarantee valid JSON. Once the static system prompt is long enough to be cached, mark it with `cache_control`.
5. **Safety floor.** Hard rules (legal threats, a duplicate ISBN) should never be rated below HIGH, even if the model says otherwise.
