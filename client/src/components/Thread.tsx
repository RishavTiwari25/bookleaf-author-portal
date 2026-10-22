import type { TicketDetail } from '../lib/types';
import { TimeAgo } from './ui';

/** The author's original query followed by the support team's responses. */
export function Thread({ ticket, viewer }: { ticket: TicketDetail; viewer: 'AUTHOR' | 'ADMIN' }) {
  return (
    <ol className="space-y-4">
      <li className="card p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span className="font-medium text-slate-700">{viewer === 'AUTHOR' ? 'You' : ticket.author.name} wrote</span>
          <TimeAgo iso={ticket.createdAt} />
        </div>
        <p className="text-sm whitespace-pre-wrap text-slate-800">{ticket.description}</p>
        {ticket.attachmentName && (
          <p className="mt-3 inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">
            Attachment: {ticket.attachmentName}
          </p>
        )}
      </li>

      {ticket.responses.map((r) => {
        const fromSupport = r.author.role === 'ADMIN';
        return (
          <li key={r.id} className={`rounded-lg border p-4 ${fromSupport ? 'border-brand-100 bg-brand-50/60 sm:ml-8' : 'card'}`}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span className="font-medium text-slate-700">
                {fromSupport ? (viewer === 'AUTHOR' ? 'BookLeaf Support' : `${r.author.name} (support)`) : r.author.name}
              </span>
              <TimeAgo iso={r.createdAt} />
            </div>
            <p className="text-sm whitespace-pre-wrap text-slate-800">{r.body}</p>
          </li>
        );
      })}
    </ol>
  );
}
