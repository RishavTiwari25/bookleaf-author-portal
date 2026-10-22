# Write-up: BookLeaf Author Support Portal

**Rishav Tiwari** · Full Stack Developer take-home

## What I prioritised

1. **The core loop works without breaking.** An author raises a query → it's classified → it lands in the right place in the admin queue → the admin gets a grounded draft, edits it and sends it → the author sees the reply live. I built that loop first and tested it end to end (also with AI switched off and with a broken API key) before adding anything else.
2. **AI that can't take the product down.** Every AI call sits behind functions that never throw. Classification falls back to keyword rules, drafts fall back to per-category templates filled with the author's real numbers, and every value records whether it came from `AI`, `FALLBACK` or a human (`MANUAL`). With no key, ticket creation still returns 201 and the admin still gets a useful starting reply.
3. **Drafts a support agent would actually send.** The prompt only gets the knowledge-base section for that ticket's category, plus an "author facts" block built from the database. I calculate the next payout date in code (quarter end + 45 days) instead of asking the model to do date maths, because a wrong date in a royalty reply is worse than no reply.
4. **Access control on the server, not the UI.** Author queries are always scoped by the `authorId` in the token. Another author's ticket returns 404 so ids can't be probed. Internal notes and AI metadata are stripped by the author serializer, so they never reach the browser at all.

## Trade-offs I made on purpose

- **SSE instead of WebSockets.** Updates only go server → client. SSE is a plain HTTP response, works through Render's proxy, and the client keeps 30 s polling as a safety net. The cost: `EventSource` can't send headers, so the JWT goes in the query string. That's acceptable for a demo, and I'd use a short-lived stream token in production.
- **Classify before saving, not in a background job.** The author waits for one short call (15 s timeout, one retry on 429/5xx), but the queue never shows an unclassified ticket and there's no job system to run. At BookLeaf's volume (1,200+ books/month) a queue worker would be the next step.
- **In-memory event bus and in-memory queue sort.** Both are simple and easy to read, and correct for one instance and hundreds of tickets. Neither scales horizontally. I documented both instead of adding Redis for a take-home.
- **A small model over a bigger one, and two providers behind one interface.** Both tasks are short and well-specified. The live demo runs on Gemini 3.5 Flash-Lite's free tier; Claude Haiku 5.5 (about $0.0002 per draft) is the alternative. The prompts, parser, cache and fallback are shared, so switching provider or model is an env change, not a code change.
- **Attachments are UI-only** (we store the file name), as the brief allowed. I spent that time on edge cases instead: books still in production with no MRP, authors who've never been paid, and "General / Account Level" queries with no book.

## How I'd evolve this for production

1. **Measure the AI.** Build a labelled eval set from real tickets. Log the draft next to the reply the agent actually sent (we already record `usedDraft` and `MANUAL` overrides) and track edit distance and override rate. Heavily edited drafts become few-shot examples.
2. **Scale the plumbing.** Postgres `LISTEN/NOTIFY` (or Redis) for events across instances, a job queue for classification and drafting with retries, cursor pagination with SQL ordering for the queue, and SLA timers that auto-escalate overdue tickets.
3. **Close the loop with authors.** Threaded follow-ups from the author, email notifications when the status changes, and real attachments (S3 + virus scan).
4. **Harden auth.** httpOnly cookie sessions or refresh tokens, audit logs of admin actions, and per-agent permissions.
5. **Grow the knowledge base.** Once it's more than a page (FAQs, past resolved tickets), move from category slicing to retrieval so prompt size stays flat, and use prompt caching for the static system prompt.
