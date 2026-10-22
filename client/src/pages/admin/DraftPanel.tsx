import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SourceChip } from '../../components/Badges';
import { Skeleton } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { RESPONSE_MAX, type Draft } from '../../lib/types';

/**
 * AI-assisted reply box. The draft loads automatically, but the admin always
 * has an editable textarea, so a failed or slow draft never blocks a reply.
 */
export function DraftPanel({ ticketId }: { ticketId: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState('');
  const [fromDraft, setFromDraft] = useState(false);
  const lastDraftBody = useRef<string | null>(null);

  // POST, but idempotent: the server caches the draft per ticket. Kept outside
  // the ['admin', ...] keys so live refreshes don't re-request it.
  const draft = useQuery({
    queryKey: ['draft', ticketId],
    queryFn: () => api<{ draft: Draft }>(`/admin/tickets/${ticketId}/draft`, { method: 'POST', body: {} }).then((r) => r.draft),
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Seed the textarea with the draft, unless the admin has already typed something of their own.
  // Runs only when the draft text changes (not on every keystroke).
  const draftBody = draft.data?.body;
  useEffect(() => {
    if (!draftBody) return;
    if (text.trim() === '' || text === lastDraftBody.current) {
      setText(draftBody);
      setFromDraft(true);
    }
    lastDraftBody.current = draftBody;
  }, [draftBody]); // `text` deliberately omitted: we only react to a new draft

  const regenerate = useMutation({
    mutationFn: () =>
      api<{ draft: Draft }>(`/admin/tickets/${ticketId}/draft`, { method: 'POST', body: { regenerate: true } }).then((r) => r.draft),
    onSuccess: (d) => {
      // An explicit regenerate replaces the textarea contents.
      lastDraftBody.current = d.body;
      setText(d.body);
      setFromDraft(true);
      queryClient.setQueryData(['draft', ticketId], d);
    },
  });

  const send = useMutation({
    mutationFn: () =>
      api(`/admin/tickets/${ticketId}/responses`, { method: 'POST', body: { body: text.trim(), usedDraft: fromDraft } }),
    onSuccess: () => {
      toast('Response sent to the author');
      setText('');
      setFromDraft(false);
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });

  const loading = draft.isPending || regenerate.isPending;
  const current = draft.data;
  const draftError = regenerate.error ?? draft.error;
  const tooLong = text.length > RESPONSE_MAX;

  return (
    <section className="card p-4" aria-labelledby="reply-heading">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="reply-heading" className="font-semibold">
          Reply to author
        </h2>
        <div className="flex items-center gap-2">
          {current && !loading && (
            <span className="text-xs text-slate-500">
              Draft <SourceChip source={current.source} title={current.model ? `Model: ${current.model}` : undefined} />
            </span>
          )}
          <button type="button" className="btn-secondary px-2.5 py-1 text-xs" onClick={() => regenerate.mutate()} disabled={loading}>
            {loading ? 'Generating…' : 'Regenerate'}
          </button>
        </div>
      </div>

      {current?.source === 'FALLBACK' && !loading && (
        <p className="mb-3 rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-600">
          Fallback template (AI unavailable). Personalise it before sending.
        </p>
      )}
      {draftError && !loading && (
        <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          Couldn't generate a draft: {errorMessage(draftError)}. You can write the response manually.
        </p>
      )}

      {loading && !text ? (
        <div className="rounded-md border border-slate-200 p-3" aria-label="Loading AI draft">
          <Skeleton lines={6} />
        </div>
      ) : (
        <>
          <label htmlFor="reply" className="sr-only">
            Response
          </label>
          <textarea
            id="reply"
            className="input min-h-56"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write your response to the author…"
          />
        </>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className={`text-xs ${tooLong ? 'text-red-600' : 'text-slate-400'}`}>
          {text.length} / {RESPONSE_MAX}
        </span>
        <button
          type="button"
          className="btn-primary"
          onClick={() => send.mutate()}
          disabled={send.isPending || !text.trim() || tooLong}
        >
          {send.isPending ? 'Sending…' : 'Send response'}
        </button>
      </div>
      {send.isError && (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {errorMessage(send.error)}
        </p>
      )}
    </section>
  );
}
