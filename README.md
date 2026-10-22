# BookLeaf Author Support & Communication Portal

A support portal for BookLeaf Publishing with two sides:

- **Author portal**: authors log in, see their books with sales and royalty numbers, raise queries about a book (or their account), and follow their tickets. Replies from the support team show up live, without a refresh.
- **Admin portal**: the support team works one queue across all authors. Every ticket is auto-classified (category + priority), the urgent and oldest ones are easy to spot, and opening a ticket gives a suggested reply grounded in BookLeaf's policies and that author's real book data. The admin edits it, sends it, and the author sees it instantly.

**Live demo:** `<add Render URL here>` · **API docs:** `<live URL>/api/docs`

## Test logins

All 10 authors from the sample dataset can log in with their dataset email and the password **`Author@123`**.

| Role | Email | Password | Good for testing |
|---|---|---|---|
| Author | `priya.sharma@email.com` | `Author@123` | royalty pending, open royalty ticket |
| Author | `kavita.deshmukh@email.com` | `Author@123` | a book still in production (no MRP, zero royalties) |
| Author | `sneha.kulkarni@email.com` | `Author@123` | 3 books incl. one in Cover Design |
| Author | `ananya.reddy@email.com` | `Author@123` | never been paid, ticket with a support reply |
| Admin | `admin@bookleaf.test` | `Admin@123` | support agent "Neha Verma" |
| Admin | `ops@bookleaf.test` | `Admin@123` | second agent "Karan Mehta" (for assignment) |

The database is seeded with the 10 authors and 18 books exactly as provided, plus 10 sample tickets spread across all categories, priorities and statuses, so the admin queue isn't empty on first load.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 19 + Vite + TypeScript + Tailwind v4, React Router 7, TanStack Query | Fast to build, typed end to end. TanStack Query gives caching + "refetch when an event arrives" for free. |
| Backend | Node + Express 5 + TypeScript | Express 5 forwards async errors to the error handler, so no try/catch wrappers in routes. |
| Database | PostgreSQL + Prisma | Relational data (author → books → tickets → messages). Prisma gives typed queries and versioned migrations. |
| Validation | zod | One schema per request body/query, errors turned into field-level 400s. |
| Auth | JWT (8 h) + bcrypt | Stateless, simple. Role and authorId live in the token. |
| Real-time | Server-Sent Events + 30 s polling fallback | Updates only flow server → client, so SSE is simpler than WebSockets and works through Render's proxy. |
| AI | Google Gemini (`@google/genai`, `gemini-3.5-flash-lite`) or Anthropic Claude (`claude-haiku-5-5`) | Same prompts, one provider interface. Gemini's free tier runs the live demo; Claude Haiku is the drop-in alternative. Optional: the app fully works without a key. |
| Deploy | One Render web service + Render Postgres | Express serves the built React app, so it's one URL and no CORS. |

## Running locally

Requirements: Node 20+ and Docker (for Postgres). Any Postgres works if you already have one.

```bash
git clone <repo-url> && cd bookleaf-author-portal
npm install                                  # installs server + client (npm workspaces)
docker compose up -d                         # Postgres on localhost:5433
cp server/.env.example server/.env           # works as-is; add GEMINI_API_KEY (or ANTHROPIC_API_KEY) to enable AI
npm run db:migrate                           # create tables
npm run db:seed                              # authors, books, admins, sample tickets

npm run dev:server                           # API on http://localhost:4000
npm run dev:client                           # UI on http://localhost:5173 (proxies /api to :4000)
```

Production-style run (what Render does): `npm run build && npm start`, then open http://localhost:4000.

Tests: `npm test` (90 tests: API auth/RBAC/validation, queue ordering, and the AI module's parsing, fallback, prompt and provider logic with the SDKs mocked. They don't need a database or an API key.)

### Environment variables

| Variable | Required | Default | What it does |
|---|---|---|---|
| `DATABASE_URL` | yes | – | Postgres connection string |
| `JWT_SECRET` | yes | – | Signs login tokens (16+ chars) |
| `PORT` | no | `4000` | HTTP port |
| `AI_PROVIDER` | no | `auto` | `gemini`, `anthropic` or `auto` (Gemini if `GEMINI_API_KEY` is set, else Anthropic if `ANTHROPIC_API_KEY` is set, else fallback mode) |
| `GEMINI_API_KEY` | no | – | Google AI Studio key; the free tier is enough for the demo |
| `GEMINI_MODEL` | no | `gemini-3.5-flash-lite` | Any Gemini model id, e.g. `gemini-3.8-flash` |
| `ANTHROPIC_API_KEY` | no | – | Anthropic key (alternative provider) |
| `AI_MODEL` | no | `claude-haiku-5-5` | Claude model id |
| `AI_TIMEOUT_MS` | no | `15000` | Per-call timeout for either provider |

With no AI key at all the app runs in fallback mode and `/api/health` reports `ai: { enabled: false, provider: "none", model: null }`.

## Architecture

```
client/  React SPA ──fetch /api──▶  server/  Express
          ▲                            ├─ routes/      thin HTTP layer: auth, validation, status codes
          └──── SSE /api/events ◀──────├─ services/    business logic (tickets.service), serializers, event bus
                                       ├─ ai/          classifier, drafter, KB, prompts, fallback, cache
                                       └─ Prisma ──▶ PostgreSQL
```

- **Routes are thin.** They validate input with zod, call a service function and pick the status code. The ticket rules (who can see what, what happens when a response is sent, how the queue is ordered) live in `server/src/services/tickets.service.ts`.
- **Serializers decide what each role sees.** `serializeTicketForAuthor` never includes internal notes, AI reasoning or the draft. The admin version adds them plus the full author profile and book data. Filtering happens on the server, never in the UI.
- **The AI module is isolated** behind three functions (`classifyTicket`, `draftResponse`, `aiStatus`) that never throw. The rest of the app doesn't know or care whether Claude is configured.

### Data model

`User` (login, role) 1–1 `Author` (profile, keyed by `AUTH001`…) 1–n `Book` (keyed internally by cuid, `bookCode` = `BK001`…) and `Author` 1–n `Ticket` n–1 `Book?` (null = "General / Account Level"). `Ticket` 1–n `TicketMessage` with `kind = RESPONSE | INTERNAL_NOTE`.

Decisions worth calling out:
- **Category and priority each store their source** (`AI`, `FALLBACK`, `MANUAL`). Admins can see where a value came from, and later we can measure how often the AI gets overridden.
- **Internal notes and responses share one table** with a `kind` column. One timeline query, and the author serializer filters out notes.
- **Money is stored as whole rupees (`Int`)**, since the source data has no paise. Floats are never used for money.
- **The draft is cached on the ticket row** (`draftBody`, `draftSource`, `draftModel`), so reopening a ticket costs nothing. Changing the category clears it, because it was grounded in the old category's policy.
- Postgres enum order is declared Critical → Low, and there are indexes on `(status, priority, createdAt)` and `authorId` for the queue and the author's ticket list.

### Real-time updates

When a ticket is created, updated or answered, the service publishes `{ type, ticketId, authorId }` on an in-process event bus. `GET /api/events` is an SSE stream: authors only get events for their own tickets (never for internal notes), admins get everything. Events carry only the ticket id. The client then refetches through the normal API, so RBAC still applies to the actual data. The client also polls every 30 s in case the stream drops, and a heartbeat every 25 s keeps proxies from closing idle connections.

### Security and access control

- Every route except login and health needs a bearer token. `requireRole('AUTHOR' | 'ADMIN')` guards each router.
- Author queries are always scoped by the `authorId` from the token. Asking for another author's ticket returns **404, not 403**, so ticket ids can't be probed. Creating a ticket on someone else's book is rejected.
- Login uses the same error for unknown email and wrong password, and it is rate-limited (20 tries / 15 min / IP).
- Errors always come back in one shape: `{ "error": { "code", "message", "details?" } }`. Validation errors list each failing field. Prisma "not found" / unique / foreign-key errors map to 404 / 409 / 400 instead of a generic 500.
- The AI keys (Gemini / Anthropic) are only read on the server from env vars and are never sent to the browser.

## AI integration

Full write-up: [`docs/AI_DESIGN.md`](docs/AI_DESIGN.md). In short:

**Classification** (on ticket creation): one short model call with category definitions, a priority rubric and few-shot examples taken from the brief's sample queries. It must return strict JSON `{category, priority, reasoning}`, `max_tokens` is 150 and thinking is off. The output is parsed and both enums are validated. Invalid JSON, an unknown category, a timeout, a 429 or a 5xx all mean we use the keyword classifier instead. The ticket is always created.

**Draft responses** (when an admin opens a ticket): the prompt contains BookLeaf's tone rules, **only the knowledge-base section for that ticket's category** (plus company basics), and an "author facts" block built in code from the database: ISBN, status, copies sold, royalty earned / paid / pending, last payout, platforms, and the **next payout date, which we calculate** from the quarterly cycle + 45-day rule rather than letting the model do date maths. The model is told to use only these facts. The admin can edit the draft or regenerate it before sending, and we record whether a sent reply came from the draft (`usedDraft`).

**Cost awareness**
- The live demo runs on Gemini's free tier, so it costs nothing. At paid list prices a draft (about 800 tokens in, 200 out) is roughly $0.0008 on Gemini 3.5 Flash-Lite ($0.30 / $2.50 per million) and $0.0002 on Claude Haiku 5.5 ($0.10 / $0.50 per million); 10,000 drafts are a few dollars either way. Classification is cheaper still.
- KB slicing by category keeps the system prompt at about 600 tokens instead of the whole KB. Descriptions are truncated and only the last 4 thread messages are sent.
- Drafts are cached per ticket (in the DB and in memory). Regeneration is an explicit button.
- Every call logs tokens and estimated cost, e.g. `[ai] draft provider=gemini model=gemini-3.5-flash-lite in=820 out=190 cost~$0.000721 1100ms`.

**Model choice:** the demo uses **Gemini 3.5 Flash-Lite** because its free tier is enough for a take-home and it is open to new API keys; **Claude Haiku 5.5** is the alternative and was the original target. Both are the small, fast model of their family, which is right for two short, well-specified tasks that run on every ticket. The prompts, the parser, the cache and the fallback are identical for both: `server/src/ai/client.ts` picks a provider from `AI_PROVIDER` / which key is set, and `providers/gemini.ts` and `providers/anthropic.ts` only translate the same request into their SDK's call. For Gemini, classification uses JSON mode (`responseMimeType: application/json`) and low temperature; both providers run with minimal thinking. Switching model or provider is an env change, not a code change.

**Graceful degradation (I tested this):** with no key the app runs in "fallback mode": weighted keyword rules for category, explicit priority rules (e.g. wrong/duplicate ISBN → Critical/High, royalty past its 45-day deadline → High), and per-category reply templates filled with the author's real numbers. With an **invalid** key, ticket creation still returns 201 in about 1 s with a FALLBACK classification and a template draft, and the 401 from the provider is only logged. A free-tier 429 from Gemini is retried once and then handled the same way. Admin screens show whether a value came from AI, fallback or a human.

## API

Interactive docs (OpenAPI 3): **`/api/docs`**. The raw spec is at `/api/openapi.json` and in [`server/openapi.yaml`](server/openapi.yaml).

| Method | Path | Who | What |
|---|---|---|---|
| POST | `/api/auth/login` | public | `{email,password}` → `{token,user}` |
| GET | `/api/auth/me` | any | current user |
| GET | `/api/books` | author | my books |
| GET | `/api/books/summary` | author | totals (copies, earned, paid, pending) |
| GET | `/api/tickets` | author | my tickets |
| POST | `/api/tickets` | author | `{bookId \| null, subject, description, attachmentName?}` → 201, already classified |
| GET | `/api/tickets/:id` | author | my ticket + responses (no internal notes) |
| GET | `/api/admin/tickets` | admin | queue; `status, category, priority, from, to, assignee=me\|unassigned, q, sort=urgency\|oldest\|newest` |
| GET | `/api/admin/tickets/:id` | admin | full ticket, author profile, book data, notes, cached draft |
| PATCH | `/api/admin/tickets/:id` | admin | `{status?, category?, priority?, assigneeId?}` (overrides become `MANUAL`) |
| POST | `/api/admin/tickets/:id/assign-me` | admin | assign to myself |
| POST | `/api/admin/tickets/:id/draft` | admin | `{regenerate?}` → cached or new draft |
| POST | `/api/admin/tickets/:id/responses` | admin | `{body, usedDraft?}` → visible to author; OPEN → IN_PROGRESS |
| POST | `/api/admin/tickets/:id/notes` | admin | internal note |
| GET | `/api/admin/stats` | admin | open / in progress / critical / overdue / avg age |
| GET | `/api/admin/team` | admin | support team (for assignment) |
| GET | `/api/events?token=` | any | SSE stream (`ticket.created`, `ticket.updated`, `ticket.response`) |
| GET | `/api/health` | public | `{ ok, ai: { enabled, model } }` |

Example:

```bash
TOKEN=$(curl -s localhost:4000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"priya.sharma@email.com","password":"Author@123"}' | jq -r .token)

curl -s localhost:4000/api/tickets -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"bookId":null,"subject":"Update my phone number","description":"I changed my number, how do I update it?"}'
# 400 example: {"error":{"code":"VALIDATION_ERROR","message":"Some fields are invalid","details":[{"field":"description","message":"Please describe the issue in at least 20 characters"}]}}
```

## Product details and edge cases

- **Queue ordering:** unresolved first, then Critical → High → Medium → Low, then oldest first. Tickets open for more than 48 h are flagged overdue. The stats bar shows open, critical, overdue and average age.
- **Books in production** (e.g. Kavita's *Raising Roots*, Sneha's *Midnight in Mysore*) have no MRP or royalties yet. MRP shows "—" instead of a fake ₹0, and the status badge shows the production stage. The AI/template drafts know the book isn't published.
- **Zero royalties / never paid** (e.g. Ananya, Arjun): `lastRoyaltyPayoutDate` stays null, and drafts explain when the first payout is due instead of inventing one.
- **Empty states** for no tickets, no books and filters with no results.
- **General / Account Level** queries have no book (`bookId: null`), and drafts for them don't invent book data.
- Replying to an OPEN ticket moves it to IN_PROGRESS and assigns it to the responder if nobody owns it.
- Attachments are UI-only as the brief allows: we store the file name, not the file.

## Known limitations and what I'd improve

- **Single instance for real-time.** The event bus is in-memory, so with more than one server instance I'd move it to Postgres `LISTEN/NOTIFY` or Redis pub/sub.
- **JWT in the SSE URL.** `EventSource` can't send headers, so the token goes in the query string. In production I'd use a short-lived, single-purpose stream token or a cookie session.
- **No refresh tokens or logout revocation.** Tokens simply expire after 8 h.
- **Authors can't reply inside a ticket yet.** They see responses and raise a new query. A follow-up thread is the next feature I'd add.
- **No real file uploads** (S3 + virus scan would be the production version).
- **Queue is capped at 500 rows and sorted in memory.** That's fine at this scale, but I'd switch to cursor pagination plus a SQL `CASE` ordering for thousands of tickets.
- **AI:** no eval set yet. Next steps are labelled examples from real tickets, tracking how much admins edit drafts and how often they override the AI, and moving the KB to retrieval once it grows beyond one page. See `docs/AI_DESIGN.md`.
- Render's free Postgres expires after 30 days and the free web service sleeps when idle (the first request takes about 30 s).

## Deploying to Render

1. Push the repo to GitHub.
2. Render dashboard → **New → Blueprint** → select the repo. `render.yaml` creates the Postgres database and the web service (`npm ci --include=dev && npm run build`, then `npm start`, which runs migrations, the idempotent seed and the server).
3. Optionally set `GEMINI_API_KEY` (free tier) or `ANTHROPIC_API_KEY` on the service. Without either the app runs in fallback mode.
4. Open the service URL and log in with the test credentials above.

## Repo layout

```
server/
  prisma/            schema, migrations, seed-data/bookleaf_sample_data.json
  src/routes/        auth, books, tickets (author), admin, events (SSE)
  src/services/      tickets.service (business rules), serializers, event bus, AI context
  src/ai/            kb, prompts, client (provider selection), providers/{gemini,anthropic,shared}, fallback, cache, index
  src/middleware/    auth + RBAC, zod validation, error handler
  test/              API/RBAC/validation tests, queue ordering, test/ai/*
  openapi.yaml
client/src/
  pages/author/      Dashboard, MyBooks, SubmitQuery, MyTickets, TicketDetail
  pages/admin/       TicketQueue, TicketDetail, DraftPanel
  lib/               api client, auth context, queries, live updates hook
docs/                AI_DESIGN.md, API_CONTRACT.md
WRITEUP.md           one-page summary of priorities and trade-offs
```
