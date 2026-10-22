import type { AiSource, Priority, TicketStatus } from '../lib/types';
import { PRIORITY_LABELS, STATUS_LABELS } from '../lib/types';

const base = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap';

const STATUS_STYLES: Record<TicketStatus, string> = {
  OPEN: 'bg-sky-100 text-sky-800',
  IN_PROGRESS: 'bg-amber-100 text-amber-800',
  RESOLVED: 'bg-emerald-100 text-emerald-800',
  CLOSED: 'bg-slate-200 text-slate-700',
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <span className={`${base} ${STATUS_STYLES[status]}`}>{STATUS_LABELS[status]}</span>;
}

const PRIORITY_STYLES: Record<Priority, string> = {
  CRITICAL: 'bg-red-600 text-white',
  HIGH: 'bg-orange-100 text-orange-800 ring-1 ring-orange-300',
  MEDIUM: 'bg-yellow-50 text-yellow-800 ring-1 ring-yellow-200',
  LOW: 'bg-slate-100 text-slate-600',
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`${base} ${PRIORITY_STYLES[priority]}`}>{PRIORITY_LABELS[priority]}</span>;
}

const SOURCE_STYLES: Record<AiSource, string> = {
  AI: 'bg-violet-100 text-violet-800',
  FALLBACK: 'bg-slate-100 text-slate-600',
  MANUAL: 'bg-brand-100 text-brand-800',
};

/** Shows who decided a value: the AI, the rule-based fallback, or an admin. */
export function SourceChip({ source, title }: { source: AiSource; title?: string }) {
  return (
    <span className={`${base} ${SOURCE_STYLES[source]} ${title ? 'cursor-help' : ''}`} title={title}>
      {source}
    </span>
  );
}

/** Unresolved tickets older than 48 h get flagged. */
export function AgingBadge({ ageHours }: { ageHours: number }) {
  const days = Math.floor(ageHours / 24);
  return (
    <span className={`${base} bg-red-50 text-red-700 ring-1 ring-red-200`} title={`Open for ${Math.round(ageHours)} hours`}>
      Aging · {days} d
    </span>
  );
}

export function isAging(t: { status: TicketStatus; ageHours: number; isOverdue?: boolean }) {
  if (t.isOverdue != null) return t.isOverdue; // prefer the server's flag when present
  return (t.status === 'OPEN' || t.status === 'IN_PROGRESS') && t.ageHours > 48;
}

/** Book statuses are free text in the dataset ("Published & Live", "In Production - Typesetting"). */
export function BookStatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const style = s.includes('publish')
    ? 'bg-emerald-100 text-emerald-800'
    : s.includes('production')
      ? 'bg-amber-100 text-amber-800'
      : 'bg-slate-100 text-slate-700';
  return <span className={`${base} ${style}`}>{status}</span>;
}
