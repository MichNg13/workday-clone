import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PrintButton } from '@/components/PrintButton';
import { Card, Empty, PageHeader, Stat } from '@/components/ui';
import { money, monthBounds, monthLabel, num, shiftMonth, sgToday } from '@/lib/format';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { HrTabs } from '../HrTabs';

export const metadata: Metadata = { title: 'Monthly Report' };

function Bars({ rows, labelKey }: { rows: any[]; labelKey: string }) {
  const max = Math.max(1, ...rows.map((r) => Number(r.days)));
  if (!rows.length) return <Empty>No approved leave this month.</Empty>;
  return (
    <ul className="bars">
      {rows.map((r) => (
        <li key={r[labelKey]}>
          <span className="bar-label">{r[labelKey]}</span>
          <span className="bar"><span style={{ width: `${(Number(r.days) / max) * 100}%` }} /></span>
          <span className="bar-value">{num(r.days)} d · {r.requests} req</span>
        </li>
      ))}
    </ul>
  );
}

export default async function Reports({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const me = await requireMe();
  if (!me.canSeeHR && !me.isFinance) notFound();
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : sgToday().slice(0, 7);
  const supabase = await createClient();
  const { data: r, error } = await supabase.rpc('hr_monthly_report', { p_month: monthBounds(month).from });
  if (error || !r) return <Card><p className="alert alert-error">{error?.message ?? 'Report unavailable.'}</p></Card>;

  const p = r.patterns;
  const flagsCount = p.sick_leave_next_to_weekend.length + p.pending_over_2_working_days.length + p.approved_clashes.length;
  const pct = (v: number | null) => (v === null || v === undefined ? '—' : `${num(v)}%`);

  return (
    <>
      <PageHeader title="HR" subtitle="Monthly leave & claims summary for HR, with patterns worth a look."
        actions={<><Link className="btn btn-secondary" href={`/hr/reports?month=${shiftMonth(month, -1)}`}>‹</Link><strong className="month-label">{monthLabel(month)}</strong><Link className="btn btn-secondary" href={`/hr/reports?month=${shiftMonth(month, 1)}`}>›</Link><PrintButton /></>} />
      {me.canSeeHR && <HrTabs current="reports" />}

      <h2 className="section-title">Service levels</h2>
      <div className="stats">
        <Stat label="Decisions this month" value={r.kpi.decided} />
        <Stat label="Decided within 1 working day" value={pct(r.kpi.within_1_working_day_pct)} tone={Number(r.kpi.within_1_working_day_pct ?? 100) >= 90 ? 'green' : 'red'} hint="Target 90%" />
        <Stat label="Decided within 2 working days" value={pct(r.kpi.within_2_working_days_pct)} tone="blue" />
        <Stat label="Average time to decision" value={r.kpi.avg_hours_to_decision === null ? '—' : `${num(r.kpi.avg_hours_to_decision)} h`} />
      </div>

      <h2 className="section-title">Leave</h2>
      <div className="stats">
        <Stat label="Requests submitted" value={r.leave.submitted} hint={`${r.leave.approved} approved · ${r.leave.rejected} rejected · ${r.leave.pending} pending`} />
        <Stat label="Working days on leave" value={num(r.leave.days_on_leave)} hint="Approved, within this month" />
      </div>
      <div className="two-col">
        <Card title="By leave type"><Bars rows={r.leave.by_type} labelKey="type" /></Card>
        <Card title="By department"><Bars rows={r.leave.by_department} labelKey="department" /></Card>
      </div>

      <h2 className="section-title">Claims</h2>
      <div className="stats">
        <Stat label="Claims submitted" value={r.claims.submitted} hint={money(r.claims.submitted_amount)} />
        <Stat label="Paid" value={r.claims.paid} hint={money(r.claims.paid_amount)} tone="green" />
        <Stat label="Awaiting payment" value={r.claims.awaiting_payment} hint={money(r.claims.awaiting_payment_amount)} tone="blue" />
        <Stat label="Returned by Finance" value={pct(r.claims.returned_pct)} hint="Target under 5%" tone={Number(r.claims.returned_pct ?? 0) < 5 ? 'green' : 'red'} />
      </div>

      <Card title={`Patterns to review (${flagsCount})`}>
        {flagsCount === 0 ? <Empty>Nothing unusual this month.</Empty> : (
          <ul className="pattern-list">
            {p.pending_over_2_working_days.map((x: any) => (
              <li key={x.reference}><strong>{x.reference}</strong> · {x.name}&apos;s {x.type} has been pending {x.working_days} working days.</li>
            ))}
            {p.sick_leave_next_to_weekend.map((x: any) => (
              <li key={x.name}><strong>{x.name}</strong> took sick leave next to a weekend {x.count} times in the last 90 days.</li>
            ))}
            {p.approved_clashes.map((x: any) => (
              <li key={x.reference}><strong>{x.reference}</strong> · {x.name}&apos;s leave was approved despite a team clash.</li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
