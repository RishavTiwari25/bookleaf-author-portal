import { BookStatusBadge } from '../../components/Badges';
import { EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { formatDate, formatINR, formatNumber } from '../../lib/format';
import { useBooks } from '../../lib/queries';
import type { Book } from '../../lib/types';

/** Royalty cell: a zero shows as a muted "₹0" rather than an alarming number. */
function Money({ value, highlight }: { value: number; highlight?: boolean }) {
  if (!value) return <span className="text-slate-400">{formatINR(0)}</span>;
  return <span className={highlight ? 'font-medium text-amber-700' : undefined}>{formatINR(value)}</span>;
}

function PublicationDate({ book }: { book: Book }) {
  return book.publicationDate ? (
    <>{formatDate(book.publicationDate)}</>
  ) : (
    <span className="text-slate-400 italic">Not yet published</span>
  );
}

export default function MyBooks() {
  const books = useBooks();

  return (
    <>
      <PageHeader title="My Books" subtitle="Sales and royalty details for each of your titles." />

      {books.isPending ? (
        <Spinner />
      ) : books.isError ? (
        <ErrorState error={books.error} onRetry={() => books.refetch()} />
      ) : books.data.length === 0 ? (
        <EmptyState title="No books yet">Your titles will appear here once they're registered with BookLeaf.</EmptyState>
      ) : (
        <>
          {/* Table on wide screens */}
          <div className="card hidden overflow-x-auto lg:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Title</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Published</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">MRP</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Copies sold</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Earned</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Paid</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Pending</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {books.data.map((b) => (
                  <tr key={b.id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{b.title}</p>
                      <p className="text-xs text-slate-500">
                        {b.genre} · ISBN <span className="font-mono">{b.isbn}</span>
                      </p>
                    </td>
                    <td className="px-4 py-3"><BookStatusBadge status={b.status} /></td>
                    <td className="px-4 py-3 whitespace-nowrap"><PublicationDate book={b} /></td>
                    <td className="px-4 py-3 text-right">{b.mrp != null ? formatINR(b.mrp) : <span className="text-slate-400">—</span>}</td>
                    <td className="px-4 py-3 text-right">{formatNumber(b.totalCopiesSold)}</td>
                    <td className="px-4 py-3 text-right"><Money value={b.totalRoyaltyEarned} /></td>
                    <td className="px-4 py-3 text-right"><Money value={b.royaltyPaid} /></td>
                    <td className="px-4 py-3 text-right"><Money value={b.royaltyPending} highlight /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards on small screens */}
          <ul className="grid gap-3 sm:grid-cols-2 lg:hidden">
            {books.data.map((b) => (
              <li key={b.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-slate-900">{b.title}</p>
                  <BookStatusBadge status={b.status} />
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {b.genre} · ISBN <span className="font-mono">{b.isbn}</span>
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-slate-500">Published</dt>
                  <dd className="text-right"><PublicationDate book={b} /></dd>
                  <dt className="text-slate-500">MRP</dt>
                  <dd className="text-right">{b.mrp != null ? formatINR(b.mrp) : '—'}</dd>
                  <dt className="text-slate-500">Copies sold</dt>
                  <dd className="text-right">{formatNumber(b.totalCopiesSold)}</dd>
                  <dt className="text-slate-500">Royalty earned</dt>
                  <dd className="text-right"><Money value={b.totalRoyaltyEarned} /></dd>
                  <dt className="text-slate-500">Paid</dt>
                  <dd className="text-right"><Money value={b.royaltyPaid} /></dd>
                  <dt className="text-slate-500">Pending</dt>
                  <dd className="text-right"><Money value={b.royaltyPending} highlight /></dd>
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
