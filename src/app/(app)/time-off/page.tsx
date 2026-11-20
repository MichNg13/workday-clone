import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, Empty, LeaveStatus, PageHeader } from '@/components/ui';
import { days, fmtDate, fmtRange, num, sgToday } from '@/lib/format';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { RequestLeaveForm } from './RequestLeaveForm';

export const metadata: Metadata = { title: 'Time Off' };

export default async function TimeOffPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const me = await requireMe();
  const today = sgToday();
  const { year: y } = await searchParams;
  const year = Number(y) || Number(today.slice(0, 4));
  const supabase = await createClient();

  const [types, balances, requests, holidays] = await Promise.all([
    supabase.from('leave_types').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('leave_balances').select('*, type:leave_type_code(name, color, sort_order, counts_toward_code)').eq('employee_id', me.id).eq('year', year),
    supabase.from('leave_requests').select('*, type:leave_type_code(name, color), approver:approver_id(full_name)')
      .eq('employee_id', me.id).gte('start_date', `${year}-01-01`).lte('start_date', `${year}-12-31`).order('start_date', { ascending: false }),
    supabase.from('public_holidays').select('*').gte('holiday_date', `${year}-01-01`).lte('holiday_date', `${year}-12-31`).order('holiday_date'),
  ]);

  const bal = (balances.data ?? []).sort((a, b) => (a.type?.sort_order ?? 0) - (b.type?.sort_order ?? 0));

  return (
    <>
      <PageHeader
        title="Time Off"
        subtitle={`Balances are your contract entitlement minus approved and pending leave. Hire date ${fmtDate(me.hire_date)}.`}
        actions={
          <div className="year-switch">
            <Link className="btn btn-secondary" href={`/time-off?year=${year - 1}`}>‹ {year - 1}</Link>
            <strong>{year}</strong>
            <Link className="btn btn-secondary" href={`/time-off?year=${year + 1}`}>{year + 1} ›</Link>
          </div>
        }
      />

      <div className="balance-cards">
        {bal.length === 0 && <Empty>No entitlements for {year} yet. HR generates them at the start of each year.</Empty>}
        {bal.map((b) => (
          <div key={b.leave_type_code} className="balance-card" style={{ borderTopColor: b.type?.color }}>
            <span className="muted">{b.type?.name}</span>
            <strong>{num(b.available)}</strong>
            <span className="small">of {num(b.entitled)} days available</span>
            <dl>
              <div><dt>Taken</dt><dd>{num(b.taken)}</dd></div>
              <div><dt>Pending</dt><dd>{num(b.pending)}</dd></div>
              {Number(b.linked) > 0 && <div><dt>Used by sick leave</dt><dd>{num(b.linked)}</dd></div>}
              {Number(b.carried_forward) !== 0 && <div><dt>Carried fwd</dt><dd>{num(b.carried_forward)}</dd></div>}
            </dl>
            {b.note && <span className="muted small">{b.note}</span>}
          </div>
        ))}
      </div>

      <div className="two-col wide-left">
        <Card title="Request Time Off">
          <RequestLeaveForm types={types.data ?? []} employeeId={me.id} today={today} />
        </Card>
        <Card title={`Public Holidays ${year}`}>
          <ul className="mini-list plain">
            {(holidays.data ?? []).map((h) => (
              <li key={h.holiday_date} className={h.holiday_date < today ? 'past' : ''}>
                <span>{h.name}</span>
                <span className="muted">{fmtDate(h.holiday_date, { weekday: 'short' })}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title={`My Requests ${year}`}>
        {(requests.data ?? []).length === 0 ? <Empty>No leave requests in {year}.</Empty> : (
          <table className="table">
            <thead>
              <tr><th>Reference</th><th>Type</th><th>Dates</th><th className="num">Days</th><th>Approver</th><th>Status</th></tr>
            </thead>
            <tbody>
              {requests.data!.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/time-off/${r.id}`}>{r.reference}</Link></td>
                  <td><span className="type-dot" style={{ background: r.type?.color }} />{r.type?.name}</td>
                  <td>{fmtRange(r.start_date, r.end_date, r.day_part)}</td>
                  <td className="num">{num(r.days)}</td>
                  <td>{r.approver?.full_name ?? '—'}</td>
                  <td><LeaveStatus status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted small">Total approved this year: {days((requests.data ?? []).filter((r) => r.status === 'approved').reduce((s, r) => s + Number(r.days), 0))}</p>
      </Card>
    </>
  );
}
