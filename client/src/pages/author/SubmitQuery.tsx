import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { useBooks } from '../../lib/queries';
import { useToast } from '../../lib/toast';
import { DESCRIPTION_MAX, DESCRIPTION_MIN, SUBJECT_MAX, SUBJECT_MIN, type TicketSummary } from '../../lib/types';

interface NewTicket {
  bookId: string | null;
  subject: string;
  description: string;
  attachmentName?: string;
}

function validate(subject: string, description: string) {
  const errors: { subject?: string; description?: string } = {};
  const s = subject.trim();
  const d = description.trim();
  if (s.length < SUBJECT_MIN) errors.subject = `Subject must be at least ${SUBJECT_MIN} characters.`;
  else if (s.length > SUBJECT_MAX) errors.subject = `Subject must be at most ${SUBJECT_MAX} characters.`;
  if (d.length < DESCRIPTION_MIN) errors.description = `Please describe the issue in at least ${DESCRIPTION_MIN} characters.`;
  else if (d.length > DESCRIPTION_MAX) errors.description = `Description must be at most ${DESCRIPTION_MAX} characters.`;
  return errors;
}

export default function SubmitQuery() {
  const books = useBooks();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const [bookId, setBookId] = useState(''); // '' = general / account-level
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false); // show errors only after the first submit attempt

  const errors = validate(subject, description);
  const hasErrors = Object.keys(errors).length > 0;

  const create = useMutation({
    mutationFn: (body: NewTicket) =>
      api<{ ticket: TicketSummary }>('/tickets', { method: 'POST', body }).then((r) => r.ticket),
    onSuccess: (ticket) => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      toast(`Ticket ${ticket.ticketNumber} submitted. We'll get back to you soon.`);
      navigate(`/author/tickets/${ticket.id}`);
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (hasErrors) return;
    create.mutate({
      bookId: bookId || null,
      subject: subject.trim(),
      description: description.trim(),
      // The file itself is not uploaded (out of scope); only its name is recorded.
      ...(attachmentName ? { attachmentName } : {}),
    });
  }

  const descLen = description.trim().length;

  return (
    <div className="max-w-2xl">
      <PageHeader title="Submit a query" subtitle="Tell us what's going on and our support team will respond here." />

      <form onSubmit={onSubmit} className="card space-y-5 p-5 sm:p-6" noValidate>
        <div>
          <label htmlFor="book" className="label">
            Related book
          </label>
          <select id="book" className="input" value={bookId} onChange={(e) => setBookId(e.target.value)} disabled={books.isPending}>
            <option value="">General / Account Level</option>
            {books.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
          {books.isError && <p className="mt-1 text-xs text-red-600">Couldn't load your books. You can still submit a general query.</p>}
        </div>

        <div>
          <label htmlFor="subject" className="label">
            Subject
          </label>
          <input
            id="subject"
            className="input"
            value={subject}
            maxLength={SUBJECT_MAX}
            onChange={(e) => setSubject(e.target.value)}
            aria-invalid={submitted && !!errors.subject}
            aria-describedby="subject-error"
            placeholder="e.g. Royalty for March not received"
          />
          {submitted && errors.subject && (
            <p id="subject-error" className="mt-1 text-xs text-red-600">
              {errors.subject}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="description" className="label">
            Description
          </label>
          <textarea
            id="description"
            className="input min-h-40"
            value={description}
            maxLength={DESCRIPTION_MAX}
            onChange={(e) => setDescription(e.target.value)}
            aria-invalid={submitted && !!errors.description}
            aria-describedby="description-help"
            placeholder="Include order IDs, dates or links that help us look into this."
          />
          <div id="description-help" className="mt-1 flex justify-between gap-4 text-xs">
            <span className="text-red-600">{submitted && errors.description}</span>
            <span className={descLen < DESCRIPTION_MIN ? 'text-slate-400' : 'text-slate-500'}>
              {descLen} / {DESCRIPTION_MAX}
            </span>
          </div>
        </div>

        <div>
          <span className="label">Attachment (optional)</span>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn-secondary" onClick={() => fileInput.current?.click()}>
              Choose file
            </button>
            <input
              ref={fileInput}
              type="file"
              className="sr-only"
              aria-label="Attachment"
              onChange={(e) => setAttachmentName(e.target.files?.[0]?.name ?? null)}
            />
            {attachmentName ? (
              <span className="flex items-center gap-2 text-sm text-slate-700">
                {attachmentName}
                <button
                  type="button"
                  className="text-xs text-slate-500 underline"
                  onClick={() => {
                    setAttachmentName(null);
                    if (fileInput.current) fileInput.current.value = '';
                  }}
                >
                  Remove
                </button>
              </span>
            ) : (
              <span className="text-sm text-slate-400">No file chosen</span>
            )}
          </div>
        </div>

        {create.isError && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage(create.error)}
          </p>
        )}

        <div className="flex justify-end gap-3">
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={create.isPending}>
            {create.isPending ? 'Submitting…' : 'Submit query'}
          </button>
        </div>
      </form>
    </div>
  );
}
