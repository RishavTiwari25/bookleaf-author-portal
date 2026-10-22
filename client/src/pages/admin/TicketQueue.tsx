import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AgingBadge, isAging, PriorityBadge, SourceChip, StatusBadge } from '../../components/Badges';
import { ErrorState, PageHeader, Spinner, StatCard, TimeAgo } from '../../components/ui';
import { api } from '../../lib/api';
import { formatHours } from '../../lib/format';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
  STATUS_LABELS,
  STATUSES,
  type AdminStats,
  type AdminTicketList,
  type Priority,
} from '../../lib/types';

// Filter keys sent to GET /api/admin/tickets. They live in the URL so a
// filtered view survives a reload and can be shared.
const FILTER_KEYS = ['status', 'category', 'priority', 'from', 'to', 'assignee', 'q', 'sort'] as const;

const ROW_ACCENT: Record<Priority, string> = {
  CRITICAL: 'border-l-red-600 bg-red-50/50',
  HIGH: 'border-l-orange-400',
  MEDIUM: 'border-l-yellow-300',
  LOW: 'border-l-transparent',
};

export default function TicketQueue() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');

  const setFilter = (key: (typeof FILTER_KEYS)[number], value: string) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  };

  // Debounce the search box so we don't fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => {
      if ((params.get('q') ?? '') !== search.trim()) setFilter('q', search.trim());
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  const filters: Record<string, string> = {};
  for (const k of FILTER_KEYS) {
    const v = params.get(k);
    if (v) filters[k] = v;
  }
  // Date inputs give "YYYY-MM-DD"; send the start/end of that day in the admin's
  // local time so the "To" day is included.
  const apiParams = { ...filters };
  if (filters.from) apiParams.from = new Date(`${filters.from}T00:00:00`).toISOString();
  if (filters.to) apiParams.to = new Date(`${filters.to}T23:59:59.999`).toISOString();
  const qs = new URLSearchParams(apiParams).toString();

  const list = useQuery({
    queryKey: ['admin', 'tickets', filters],
    queryFn: () => api<AdminTicketList>(`/admin/tickets${qs ? `?${qs}` : ''}`),
    placeholderData: keepPreviousData, // keep the old list visible while filters change
  });
  const stats = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => api<AdminStats>('/admin/stats'),
  });

  const hasFilters = Object.keys(filters).some((k) => k !== 'sort');

  return (
    <>
      <PageHeader
        title="Ticket queue"
        subtitle={
          stats.data && (
            <>
              AI triage:{' '}
              {stats.data.aiEnabled ? (
                <span className="text-emerald-700">enabled</span>
              ) : (
                <span className="text-amber-700">off (rule-based fallback)</span>
              )}
            </>
          )
        }
      />

      {stats.isError ? (
        <ErrorState error={stats.error} onRetry={() => stats.refetch()} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <StatCard label="Open" value={stats.data?.open ?? '–'} />
          <StatCard label="In progress" value={stats.data?.inProgress ?? '–'} />
          <StatCard label="Resolved" value={stats.data?.resolved ?? '–'} />
          <StatCard label="Closed" value={stats.data?.closed ?? '–'} />
          <StatCard label="Critical" value={stats.data?.critical ?? '–'} tone={stats.data?.critical ? 'danger' : undefined} />
          <StatCard label="High" value={stats.data?.high ?? '–'} tone={stats.data?.high ? 'warn' : undefined} />
          <StatCard label="Avg age" value={stats.data ? formatHours(stats.data.avgAgeHours) : '–'} hint="unresolved tickets" />
        </div>
      )}

      {/* Filters */}
      <form className="card mt-6 grid grid-cols-2 gap-3 p-4 md:grid-cols-4 xl:grid-cols-8" onSubmit={(e) => e.preventDefault()} role="search">
        <div className="col-span-2">
          <label htmlFor="q" className="label">Search</label>
          <input
            id="q"
            type="search"
            className="input"
            placeholder="Subject, ticket #, author…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="f-status" className="label">Status</label>
          <select id="f-status" className="input" value={filters.status ?? ''} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
                {list.data?.counts.byStatus[s] != null ? ` (${list.data.counts.byStatus[s]})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-priority" className="label">Priority</label>
          <select id="f-priority" className="input" value={filters.priority ?? ''} onChange={(e) => setFilter('priority', e.target.value)}>
            <option value="">All</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
                {list.data?.counts.byPriority[p] != null ? ` (${list.data.counts.byPriority[p]})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 md:col-span-1">
          <label htmlFor="f-category" className="label">Category</label>
          <select id="f-category" className="input" value={filters.category ?? ''} onChange={(e) => setFilter('category', e.target.value)}>
            <option value="">All</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-assignee" className="label">Assignee</label>
          <select id="f-assignee" className="input" value={filters.assignee ?? ''} onChange={(e) => setFilter('assignee', e.target.value)}>
            <option value="">Anyone</option>
            <option value="me">Assigned to me</option>
            <option value="unassigned">Unassigned</option>
          </select>
        </div>
        <div>
          <label htmlFor="f-sort" className="label">Sort</label>
          <select id="f-sort" className="input" value={filters.sort ?? 'urgency'} onChange={(e) => setFilter('sort', e.target.value === 'urgency' ? '' : e.target.value)}>
            <option value="urgency">Most urgent</option>
            <option value="oldest">Oldest first</option>
            <option value="newest">Newest first</option>
          </select>
        </div>
        <div>
          <label htmlFor="f-from" className="label">From</label>
          <input id="f-from" type="date" className="input" value={filters.from ?? ''} onChange={(e) => setFilter('from', e.target.value)} />
        </div>
        <div>
          <label htmlFor="f-to" className="label">To</label>
          <input id="f-to" type="date" className="input" value={filters.to ?? ''} onChange={(e) => setFilter('to', e.target.value)} />
        </div>
        {hasFilters && (
          <div className="col-span-2 flex items-end md:col-span-4 xl:col-span-8">
            <button
              type="button"
              className="text-sm text-brand-700 hover:underline"
              onClick={() => {
                setSearch('');
                setParams(filters.sort ? { sort: filters.sort } : {}, { replace: true });
              }}
            >
              Clear filters
            </button>
          </div>
        )}
      </form>

      {/* List */}
      <section className="mt-4" aria-busy={list.isFetching}>
        {list.isPending ? (
          <Spinner />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.data.tickets.length === 0 ? (
          <p className="card p-8 text-center text-sm text-slate-500">
            {hasFilters ? 'No tickets match these filters.' : 'The queue is empty. Nice work!'}
          </p>
        ) : (
          <ul className={`card divide-y divide-slate-100 overflow-hidden ${list.isPlaceholderData ? 'opacity-60' : ''}`}>
            {list.data.tickets.map((t) => (
              <li key={t.id}>
                <Link
                  to={`/admin/tickets/${t.id}`}
                  className={`block border-l-4 px-4 py-3 hover:bg-slate-50 ${ROW_ACCENT[t.priority]}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <PriorityBadge priority={t.priority} />
                    <span className="font-mono text-xs text-slate-500">{t.ticketNumber}</span>
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{t.subject}</span>
                    <StatusBadge status={t.status} />
                    {isAging(t) && <AgingBadge ageHours={t.ageHours} />}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span>{t.author.name}</span>
                    <span>· {t.book?.title ?? 'General / Account'}</span>
                    <span className="inline-flex items-center gap-1">
                      · {CATEGORY_LABELS[t.category]} <SourceChip source={t.categorySource} />
                    </span>
                    <span>· {t.assignee ? `Assigned to ${t.assignee.name}` : 'Unassigned'}</span>
                    <span>
                      · Opened <TimeAgo iso={t.createdAt} />
                    </span>
                    <span>
                      · Last activity <TimeAgo iso={t.lastActivityAt} />
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
