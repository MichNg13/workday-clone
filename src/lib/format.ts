const TZ = 'Asia/Singapore';

export function sgToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

export function fmtDate(d: string | null | undefined, opts: Intl.DateTimeFormatOptions = {}) {
  if (!d) return '—';
  const date = d.length === 10 ? new Date(d + 'T00:00:00+08:00') : new Date(d);
  return new Intl.DateTimeFormat('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ, ...opts }).format(date);
}

export function fmtDateTime(d: string | null | undefined) {
  if (!d) return '—';
  return new Intl.DateTimeFormat('en-SG', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ,
  }).format(new Date(d));
}

export function fmtRange(start: string, end: string, part?: string) {
  const half = part && part !== 'full' ? ` (${part.toUpperCase()})` : '';
  if (start === end) return fmtDate(start) + half;
  const s = new Date(start + 'T00:00:00+08:00');
  const e = new Date(end + 'T00:00:00+08:00');
  const sameYear = s.getFullYear() === e.getFullYear();
  return `${fmtDate(start, sameYear ? { year: undefined } : {})} – ${fmtDate(end)}`;
}

export function money(n: number | string | null | undefined, currency = 'SGD') {
  const v = Number(n ?? 0);
  return `${currency} ${v.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function days(n: number | string | null | undefined) {
  const v = Number(n ?? 0);
  return `${Number.isInteger(v) ? v : v.toFixed(1)} ${Math.abs(v) === 1 ? 'day' : 'days'}`;
}

export function num(n: number | string | null | undefined) {
  const v = Number(n ?? 0);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export function timeAgo(d: string) {
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} d ago`;
  return fmtDate(d);
}

export function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-SG', { hour: 'numeric', hourCycle: 'h23', timeZone: TZ }).format(new Date()));
  if (h < 12) return 'Good Morning';
  if (h < 18) return 'Good Afternoon';
  return 'Good Evening';
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export const LEAVE_STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: 'Awaiting approval', tone: 'amber' },
  approved: { label: 'Approved', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
  cancelled: { label: 'Cancelled', tone: 'grey' },
};

export const CLAIM_STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: 'Awaiting approval', tone: 'amber' },
  approved: { label: 'Submitted to Finance', tone: 'blue' },
  rejected: { label: 'Rejected', tone: 'red' },
  returned: { label: 'Returned by Finance', tone: 'red' },
  paid: { label: 'Paid', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'grey' },
};

export const ROLE_LABEL: Record<string, string> = {
  employee: 'Employee',
  director: 'Director',
  hr: 'HR',
  office_manager: 'Office Manager',
  finance: 'Finance',
  admin: 'Administrator',
};

export const ACTION_LABEL: Record<string, string> = {
  submitted: 'Submitted',
  resubmitted: 'Resubmitted',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  reminded: 'Reminder sent to approver',
  escalated: 'Escalated',
  paid: 'Paid by Finance',
  returned: 'Returned by Finance',
};

export function csvEscape(v: unknown) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]) {
  return [headers, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n') + '\r\n';
}

export function monthBounds(month: string) {
  // month = YYYY-MM
  const [y, m] = month.split('-').map(Number);
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const to = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  return { from, to, year: y!, monthIndex: m! - 1, lastDay: last };
}

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(month: string) {
  const { from } = monthBounds(month);
  return fmtDate(from, { day: undefined, month: 'long', year: 'numeric' });
}
