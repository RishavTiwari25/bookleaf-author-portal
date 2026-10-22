import { Link, useParams } from 'react-router';
import { StatusBadge } from '../../components/Badges';
import { Thread } from '../../components/Thread';
import { ErrorState, Spinner, TimeAgo } from '../../components/ui';
import { useMyTicket } from '../../lib/queries';

export default function AuthorTicketDetail() {
  const { id = '' } = useParams();
  const query = useMyTicket(id);

  if (query.isPending) return <Spinner />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const t = query.data;

  return (
    <div className="max-w-3xl">
      <Link to="/author/tickets" className="text-sm text-brand-700 hover:underline">
        ← My tickets
      </Link>
      <div className="mt-3 mb-6">
        <p className="font-mono text-xs text-slate-500">{t.ticketNumber}</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{t.subject}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-500">
          <StatusBadge status={t.status} />
          <span>{t.book?.title ?? 'General / Account Level'}</span>
          <span>
            Opened <TimeAgo iso={t.createdAt} />
          </span>
        </div>
      </div>

      <Thread ticket={t} viewer="AUTHOR" />

      {t.responses.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">
          Our team has received your query and will reply here. This page updates automatically.
        </p>
      )}
    </div>
  );
}
