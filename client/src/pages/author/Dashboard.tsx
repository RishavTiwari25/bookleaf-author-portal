import { Link } from 'react-router';
import { StatusBadge } from '../../components/Badges';
import { ErrorState, PageHeader, Spinner, StatCard, TimeAgo } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { formatINR, formatNumber } from '../../lib/format';
import { useBookSummary, useMyTickets } from '../../lib/queries';

export default function AuthorDashboard() {
  const { user } = useAuth();
  const summary = useBookSummary();
  const tickets = useMyTickets();

  const openTickets = tickets.data?.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS') ?? [];

  return (
    <>
      <PageHeader
        title={`Welcome, ${user?.name.split(' ')[0] ?? 'author'}`}
        subtitle="Your books, royalties and support requests at a glance."
        actions={
          <Link to="/author/tickets/new" className="btn-primary">
            Submit a query
          </Link>
        }
      />

      {summary.isPending ? (
        <Spinner />
      ) : summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Books" value={formatNumber(summary.data.totalBooks)} />
          <StatCard label="Copies sold" value={formatNumber(summary.data.totalCopiesSold)} />
          <StatCard label="Royalty earned" value={formatINR(summary.data.totalRoyaltyEarned)} />
          <StatCard label="Royalty paid" value={formatINR(summary.data.royaltyPaid)} />
          <StatCard
            label="Royalty pending"
            value={formatINR(summary.data.royaltyPending)}
            tone={summary.data.royaltyPending > 0 ? 'warn' : undefined}
          />
        </div>
      )}

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Active tickets</h2>
          <Link to="/author/tickets" className="text-sm text-brand-700 hover:underline">
            View all
          </Link>
        </div>
        {tickets.isPending ? (
          <Spinner />
        ) : tickets.isError ? (
          <ErrorState error={tickets.error} onRetry={() => tickets.refetch()} />
        ) : openTickets.length === 0 ? (
          <p className="card p-4 text-sm text-slate-500">No open tickets. Everything is up to date.</p>
        ) : (
          <ul className="card divide-y divide-slate-100">
            {openTickets.slice(0, 5).map((t) => (
              <li key={t.id}>
                <Link to={`/author/tickets/${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                  <span className="font-mono text-xs text-slate-500">{t.ticketNumber}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.subject}</span>
                  <StatusBadge status={t.status} />
                  <TimeAgo iso={t.lastActivityAt} className="hidden text-xs text-slate-500 sm:inline" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
