import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AgingBadge, BookStatusBadge, isAging, PriorityBadge, SourceChip, StatusBadge } from '../../components/Badges';
import { Thread } from '../../components/Thread';
import { ErrorState, Spinner, TimeAgo } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate, formatINR, formatNumber } from '../../lib/format';
import { useToast } from '../../lib/toast';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
  STATUS_LABELS,
  STATUSES,
  type Category,
  type Priority,
  type TicketDetail,
  type TicketStatus,
} from '../../lib/types';
import { DraftPanel } from './DraftPanel';

type TicketPatch = Partial<{ status: TicketStatus; category: Category; priority: Priority; assigneeId: string | null }>;

export default function AdminTicketDetail() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['admin', 'ticket', id],
    queryFn: () => api<{ ticket: TicketDetail }>(`/admin/tickets/${id}`).then((r) => r.ticket),
  });

  // Refresh this ticket plus the queue/stats after any change.
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin'] });

  const patch = useMutation({
    mutationFn: (body: TicketPatch) => api(`/admin/tickets/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      toast('Ticket updated');
      refresh();
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });

  const assignMe = useMutation({
    mutationFn: () => api(`/admin/tickets/${id}/assign-me`, { method: 'POST' }),
    onSuccess: () => {
      toast('Assigned to you');
      refresh();
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });

  if (query.isPending) return <Spinner />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const t = query.data;
  const book = t.book;
  const assignedToMe = t.assignee?.id === user?.id;

  return (
    <>
      <Link to="/admin" className="text-sm text-brand-700 hover:underline">
        ← Ticket queue
      </Link>
      <div className="mt-3 mb-6">
        <p className="font-mono text-xs text-slate-500">{t.ticketNumber}</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{t.subject}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <PriorityBadge priority={t.priority} />
          <StatusBadge status={t.status} />
          {isAging(t) && <AgingBadge ageHours={t.ageHours} />}
          <span>
            Opened <TimeAgo iso={t.createdAt} />
          </span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* Left pane: context and conversation */}
        <div className="space-y-6">
          <section className="card p-4" aria-labelledby="context-heading">
            <h2 id="context-heading" className="mb-3 font-semibold">
              Author &amp; book
            </h2>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Author</dt>
                <dd className="text-right font-medium">{t.author.name}</dd>
              </div>
              {t.author.email && (
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Email</dt>
                  <dd className="truncate text-right">{t.author.email}</dd>
                </div>
              )}
              {t.author.city && (
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">City</dt>
                  <dd className="text-right">{t.author.city}</dd>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Book</dt>
                <dd className="text-right font-medium">{book?.title ?? 'General / Account level'}</dd>
              </div>
              {book && (
                <>
                  {book.status && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Status</dt>
                      <dd className="text-right"><BookStatusBadge status={book.status} /></dd>
                    </div>
                  )}
                  {book.isbn && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">ISBN</dt>
                      <dd className="text-right font-mono text-xs">{book.isbn}</dd>
                    </div>
                  )}
                  {'publicationDate' in book && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Published</dt>
                      <dd className="text-right">{book.publicationDate ? formatDate(book.publicationDate) : 'Not yet published'}</dd>
                    </div>
                  )}
                  {book.totalCopiesSold != null && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Copies sold</dt>
                      <dd className="text-right">{formatNumber(book.totalCopiesSold)}</dd>
                    </div>
                  )}
                  {book.totalRoyaltyEarned != null && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Royalty earned</dt>
                      <dd className="text-right">{formatINR(book.totalRoyaltyEarned)}</dd>
                    </div>
                  )}
                  {book.royaltyPaid != null && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Royalty paid</dt>
                      <dd className="text-right">{formatINR(book.royaltyPaid)}</dd>
                    </div>
                  )}
                  {book.royaltyPending != null && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Royalty pending</dt>
                      <dd className={`text-right ${book.royaltyPending > 0 ? 'font-medium text-amber-700' : ''}`}>
                        {formatINR(book.royaltyPending)}
                      </dd>
                    </div>
                  )}
                  {'lastRoyaltyPayoutDate' in book && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Last payout</dt>
                      <dd className="text-right">{formatDate(book.lastRoyaltyPayoutDate)}</dd>
                    </div>
                  )}
                </>
              )}
            </dl>
          </section>

          <section aria-labelledby="thread-heading">
            <h2 id="thread-heading" className="mb-3 font-semibold">
              Conversation
            </h2>
            <Thread ticket={t} viewer="ADMIN" />
          </section>

          <InternalNotes ticket={t} onAdded={refresh} />
        </div>

        {/* Right pane: triage and reply */}
        <div className="space-y-6">
          <section className="card space-y-4 p-4" aria-labelledby="triage-heading">
            <h2 id="triage-heading" className="font-semibold">
              Triage
            </h2>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="category" className="text-sm font-medium text-slate-700">Category</label>
                <SourceChip source={t.categorySource} title={sourceTitle(t.categorySource, t.aiReasoning)} />
              </div>
              <select
                id="category"
                className="input"
                value={t.category}
                disabled={patch.isPending}
                onChange={(e) => patch.mutate({ category: e.target.value as Category })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="priority" className="text-sm font-medium text-slate-700">Priority</label>
                <SourceChip source={t.prioritySource} title={sourceTitle(t.prioritySource, t.aiReasoning)} />
              </div>
              <select
                id="priority"
                className="input"
                value={t.priority}
                disabled={patch.isPending}
                onChange={(e) => patch.mutate({ priority: e.target.value as Priority })}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="status" className="label">Status</label>
              <select
                id="status"
                className="input"
                value={t.status}
                disabled={patch.isPending}
                onChange={(e) => patch.mutate({ status: e.target.value as TicketStatus })}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-sm">
              <span className="text-slate-600">
                Assignee: <span className="font-medium text-slate-900">{t.assignee ? (assignedToMe ? 'You' : t.assignee.name) : 'Unassigned'}</span>
              </span>
              {!assignedToMe && (
                <button type="button" className="btn-secondary px-2.5 py-1 text-xs" onClick={() => assignMe.mutate()} disabled={assignMe.isPending}>
                  {assignMe.isPending ? 'Assigning…' : 'Assign to me'}
                </button>
              )}
            </div>
          </section>

          <DraftPanel ticketId={id} />
        </div>
      </div>
    </>
  );
}

function sourceTitle(source: string, reasoning?: string | null) {
  if (source === 'MANUAL') return 'Set manually by an admin';
  if (source === 'FALLBACK') return reasoning || 'Set by keyword rules (AI unavailable)';
  return reasoning || 'Classified by AI';
}

function InternalNotes({ ticket, onAdded }: { ticket: TicketDetail; onAdded: () => void }) {
  const [body, setBody] = useState('');
  const add = useMutation({
    mutationFn: (text: string) => api(`/admin/tickets/${ticket.id}/notes`, { method: 'POST', body: { body: text } }),
    onSuccess: () => {
      setBody('');
      onAdded();
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (body.trim()) add.mutate(body.trim());
  }

  const notes = ticket.internalNotes ?? [];

  return (
    <section className="rounded-lg border border-yellow-300 bg-yellow-50 p-4" aria-labelledby="notes-heading">
      <h2 id="notes-heading" className="font-semibold text-yellow-900">
        Internal notes
      </h2>
      <p className="mb-3 text-xs font-medium text-yellow-800">Internal — not visible to author</p>

      {notes.length === 0 ? (
        <p className="mb-3 text-sm text-yellow-800/80">No notes yet.</p>
      ) : (
        <ul className="mb-3 space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-md bg-white/70 p-3 text-sm">
              <div className="mb-1 flex justify-between gap-2 text-xs text-slate-500">
                <span className="font-medium text-slate-700">{n.author.name}</span>
                <TimeAgo iso={n.createdAt} />
              </div>
              <p className="whitespace-pre-wrap">{n.body}</p>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={onSubmit} className="space-y-2">
        <label htmlFor="note" className="sr-only">
          Add internal note
        </label>
        <textarea
          id="note"
          className="input min-h-20 border-yellow-300"
          placeholder="Add a note for the team…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        {add.isError && (
          <p role="alert" className="text-xs text-red-700">
            {errorMessage(add.error)}
          </p>
        )}
        <div className="flex justify-end">
          <button type="submit" className="btn-secondary" disabled={add.isPending || !body.trim()}>
            {add.isPending ? 'Saving…' : 'Add note'}
          </button>
        </div>
      </form>
    </section>
  );
}
