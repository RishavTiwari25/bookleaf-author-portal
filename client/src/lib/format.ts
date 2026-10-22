const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const num = new Intl.NumberFormat('en-IN');
const fullDate = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
const shortDate = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' });

/** ₹1,23,456 (Indian digit grouping). */
export function formatINR(value: number | null | undefined): string {
  return inr.format(value ?? 0);
}

export function formatNumber(value: number | null | undefined): string {
  return num.format(value ?? 0);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : shortDate.format(d);
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : fullDate.format(d);
}

/** "just now", "5 min ago", "2 h ago", "3 d ago", then a plain date. */
export function timeAgo(iso: string, now = Date.now()): string {
  const diffMs = now - new Date(iso).getTime();
  if (Number.isNaN(diffMs)) return '';
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} d ago`;
  return formatDate(iso);
}

export function formatHours(hours: number): string {
  if (hours < 1) return '<1 h';
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} d`;
}
