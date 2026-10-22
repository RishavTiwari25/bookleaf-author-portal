import { Link } from 'react-router';
import { StatusBadge } from '../../components/Badges';
import { EmptyState, ErrorState, PageHeader, Spinner, TimeAgo } from '../../components/ui';
import { useMyTickets } from '../../lib/queries';

export default function MyTickets() {
  const tickets = useMyTickets();

  return (
    <>
      <PageHeader
        title="My Tickets"
        subtitle="All your support requests and their latest status."
        actions={
          <Link to="/author/tickets/new" className="btn-primary">
            New query
          </Link>
        }
      />

      {tickets.isPending ? (
        <Spinner />
      ) : tickets.isError ? (
        <ErrorState error={tickets.error} onRetry={() => tickets.refetch()} />
      ) : tickets.data.length === 0 ? (
        <EmptyState title="No tickets yet — raise one" action={{ to: '/author/tickets/new', label: 'Submit a query' }}>
          Questions about royalties, ISBNs, printing or distribution? We're here to help.
        </EmptyState>
      ) : (
        <ul className="card divide-y divide-slate-100">
          {tickets.data.map((t) => (
            <li key={t.id}>
              <Link to={`/author/tickets/${t.id}`} className="block px-4 py-3 hover:bg-slate-50 sm:flex sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2">
                    <span className="font-mono text-xs text-slate-500">{t.ticketNumber}</span>
                    <span className="truncate font-medium text-slate-900">{t.subject}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {t.book?.title ?? 'General / Account Level'} · {t.responseCount}{' '}
                    {t.responseCount === 1 ? 'reply' : 'replies'}
                  </p>
                </div>
                <div className="mt-2 flex items-center gap-3 sm:mt-0">
                  <StatusBadge status={t.status} />
                  <span className="text-xs text-slate-500">
                    Last activity <TimeAgo iso={t.lastActivityAt} />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
