# API & module contract (shared by all build agents)

Stack: TypeScript everywhere. `server/` is Express + Prisma (PostgreSQL; SQLite allowed for local dev) + zod + JWT (bcrypt) + SSE. `client/` is React + Vite + Tailwind + React Router. In production Express serves `client/dist`.

## Ownership (do NOT edit files you don't own)
| Owner | Paths |
|---|---|
| **server agent** | `server/**` except `server/src/ai/**`; root `package.json`, `render.yaml`, `.env.example`, `.gitignore`; `README.md`, `WRITEUP.md` (written last); git commits |
| **ai agent** | `server/src/ai/**`, `server/test/ai/**` |
| **client agent** | `client/**` |

Git: only the server agent runs `git add/commit`. The other agents just write files and tell the server agent what they finished (via a short note in `docs/STATUS.md`, appending one line each).

## Enums (exact strings)
- Role: `AUTHOR` | `ADMIN`
- TicketStatus: `OPEN` | `IN_PROGRESS` | `RESOLVED` | `CLOSED` (UI labels: Open, In Progress, Resolved, Closed)
- Priority: `CRITICAL` | `HIGH` | `MEDIUM` | `LOW`
- Category: `ROYALTY_PAYMENTS` | `ISBN_METADATA` | `PRINTING_QUALITY` | `DISTRIBUTION_AVAILABILITY` | `BOOK_STATUS_PRODUCTION` | `GENERAL_INQUIRY`
  (labels: Royalty & Payments, ISBN & Metadata Issues, Printing & Quality, Distribution & Availability, Book Status & Production Updates, General Inquiry)
- AiSource: `AI` | `FALLBACK` | `MANUAL` (on category, priority and drafts, it records who decided)

## AI module interface (`server/src/ai/index.ts`, owned by the ai agent)
```ts
export interface TicketContext {
  subject: string; description: string;
  author: { name: string; email: string; city?: string; joinedDate?: string };
  book?: { title: string; isbn: string; status: string; genre?: string; publicationDate?: string; mrp: number;
           totalCopiesSold: number; totalRoyaltyEarned: number; royaltyPaid: number; royaltyPending: number;
           lastRoyaltyPayoutDate?: string | null; printPartner?: string; availableOn: string[] } | null;
}
export interface Classification { category: Category; priority: Priority; source: 'AI' | 'FALLBACK'; reasoning?: string }
export interface Draft { body: string; source: 'AI' | 'FALLBACK'; model?: string; inputTokens?: number; outputTokens?: number }
export function classifyTicket(ctx: TicketContext): Promise<Classification>;          // never throws; falls back to heuristics
export function draftResponse(ctx: TicketContext & { category: Category; priority: Priority;
  thread?: { from: 'AUTHOR' | 'ADMIN'; body: string }[] }): Promise<Draft>;           // never throws; fallback = category template
export function aiStatus(): { enabled: boolean; provider: 'gemini' | 'anthropic' | 'none'; model: string | null };
```
Category/Priority types are string unions matching the enums above (export them from `server/src/ai/types.ts`). Env: `AI_PROVIDER` (`auto` | `gemini` | `anthropic`, default `auto`), `GEMINI_API_KEY` + `GEMINI_MODEL` (default `gemini-3.5-flash-lite`), `ANTHROPIC_API_KEY` + `AI_MODEL` (default `claude-haiku-5-5`), `AI_TIMEOUT_MS` (default 15000). Without any key, everything still works in FALLBACK mode.

## REST API (base `/api`, JSON, auth = `Authorization: Bearer <jwt>`)
Errors always come back as `{ "error": { "code": "VALIDATION_ERROR"|"UNAUTHORIZED"|"FORBIDDEN"|"NOT_FOUND"|"CONFLICT"|"INTERNAL", "message": string, "details"?: any } }` with the matching 400/401/403/404/409/500 status.

Auth
- `POST /api/auth/login` `{email,password}` → `{ token, user: {id,name,email,role} }`
- `GET /api/auth/me` → `{ user }`

Author (role AUTHOR; only sees its own data)
- `GET /api/books` → `{ books: Book[] }`. Book = `{id, bookCode, title, isbn, genre, publicationDate, status, mrp, authorRoyaltyPerCopy, totalCopiesSold, totalRoyaltyEarned, royaltyPaid, royaltyPending, lastRoyaltyPayoutDate, printPartner, availableOn: string[]}`
- `GET /api/books/summary` → `{ totalBooks, totalCopiesSold, totalRoyaltyEarned, royaltyPaid, royaltyPending }`
- `POST /api/tickets` `{ bookId: string|null, subject (5-150), description (20-5000), attachmentName?: string }` → `201 { ticket }` (classification happens before the response; it never blocks creation)
- `GET /api/tickets` → `{ tickets: TicketSummary[] }` (the author's own)
- `GET /api/tickets/:id` → `{ ticket: TicketDetail }`. For authors, the `internalNotes` field and AI fields are omitted.

Admin (role ADMIN)
- `GET /api/admin/tickets?status=&category=&priority=&from=&to=&assignee=me|unassigned&q=&sort=urgency|oldest|newest` → `{ tickets: TicketSummary[], counts: { byStatus, byPriority } }`. The default sort is urgency (priority weight, then oldest first).
- `GET /api/admin/tickets/:id` → `{ ticket: TicketDetail }` (includes internalNotes, AI metadata, author + book)
- `PATCH /api/admin/tickets/:id` `{ status?, category?, priority?, assigneeId?: string|null }` → `{ ticket }`. A category/priority override sets the source to MANUAL.
- `POST /api/admin/tickets/:id/draft` `{ regenerate?: boolean }` → `{ draft: { body, source, model?, createdAt } }` (cached per ticket unless regenerate)
- `POST /api/admin/tickets/:id/responses` `{ body (1-10000), usedDraft?: boolean }` → `201 { response }`. If the status is OPEN it automatically moves to IN_PROGRESS.
- `POST /api/admin/tickets/:id/notes` `{ body }` → `201 { note }`
- `POST /api/admin/tickets/:id/assign-me` → `{ ticket }`
- `GET /api/admin/stats` → `{ open, inProgress, resolved, closed, critical, high, avgAgeHours, aiEnabled }`

Shapes
- TicketSummary: `{ id, ticketNumber (e.g. "BL-1042"), subject, status, category, categorySource, priority, prioritySource, createdAt, updatedAt, ageHours, author: {id,name}, book: {id,title}|null, assignee: {id,name}|null, responseCount, lastActivityAt }`
- TicketDetail: TicketSummary + `{ description, attachmentName, responses: {id, body, author: {id,name,role}, createdAt}[], internalNotes?: {id, body, author:{id,name}, createdAt}[], aiReasoning? }`

Real-time (SSE)
- `GET /api/events?token=<jwt>` (EventSource can't send headers). Events: `ticket.created`, `ticket.updated`, `ticket.response` with data `{ ticketId }`. Authors only receive events for their own tickets; admins receive all of them. The client refetches on each event and also polls every 30 s as a fallback.

Misc
- `GET /api/health` → `{ ok: true, ai: aiStatus() }`
- Docs: OpenAPI at `/api/docs` (swagger-ui) + `server/openapi.yaml`.

Seed users: all 10 authors use the password `Author@123` and the email from the dataset. Admins: `admin@bookleaf.test` / `Admin@123` and `ops@bookleaf.test` / `Admin@123`. The client dev server proxies `/api` to `http://localhost:4000`.
