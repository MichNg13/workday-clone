import type { Metadata } from 'next';
import { AbsenceCalendar } from '@/components/AbsenceCalendar';
import { Card, Empty, PageHeader } from '@/components/ui';
import { monthBounds, num, sgToday } from '@/lib/format';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'My Team' };

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const me = await requireMe();
  const today = sgToday();
  const { month: m } = await searchParams;
  const month = m && /^\d{4}-\d{2}$/.test(m) ? m : today.slice(0, 7);
  const { from, to, year } = monthBounds(month);
  const supabase = await createClient();

  const seeAll = me.canSeeHR;
  let peopleQ = supabase.from('employees').select('id, full_name, manager_id, department_id, department:department_id(name)').eq('is_active', true).order('full_name');
  if (!seeAll) {
    const ors = [`manager_id.eq.${me.id}`, `id.eq.${me.id}`];
    if (me.department_id) ors.push(`department_id.eq.${me.department_id}`);
    if (me.manager_id) ors.push(`manager_id.eq.${me.manager_id}`);
    peopleQ = peopleQ.or(ors.join(','));
  }
  const [people, absences, holidays] = await Promise.all([
    peopleQ,
    supabase.rpc('team_absences', { p_from: from, p_to: to }),
    supabase.from('public_holidays').select('*').gte('holiday_date', from).lte('holiday_date', to),
  ]);
  const ppl = (people.data ?? []).map((p: any) => ({ id: p.id, full_name: p.full_name, department: seeAll ? p.department?.name : null, manager_id: p.manager_id }));

  // Balances of people I manage (RLS: managers see their reporting line)
  const reportIds = ppl.filter((p) => p.manager_id === me.id).map((p) => p.id);
  const { data: bal } = reportIds.length
    ? await supabase.from('leave_balances').select('*, employee:employee_id(full_name)').in('employee_id', reportIds).eq('year', year).in('leave_type_code', ['AL', 'SL', 'HL', 'CCL'])
    : { data: [] as any[] };
  const grid = new Map<string, Record<string, any>>();
  (bal ?? []).forEach((b) => grid.set(b.employee?.full_name, { ...(grid.get(b.employee?.full_name) ?? {}), [b.leave_type_code]: b }));

  return (
    <>
      <PageHeader title="My Team" subtitle={seeAll ? 'Absence calendar for the whole organisation.' : 'Your department and direct reports. Use it to spot clashes before you approve.'} />
      <Card>
        <AbsenceCalendar month={month} people={ppl} absences={absences.data ?? []} holidays={holidays.data ?? []} basePath="/team" />
      </Card>
      {reportIds.length > 0 && (
        <Card title={`Direct reports · balances ${year}`}>
          {grid.size === 0 ? <Empty>No balances yet.</Empty> : (
            <table className="table">
              <thead><tr><th>Worker</th><th className="num">Annual</th><th className="num">Sick</th><th className="num">Hospitalisation</th><th className="num">Childcare</th></tr></thead>
              <tbody>
                {[...grid.entries()].map(([name, b]) => (
                  <tr key={name}>
                    <td>{name}</td>
                    {['AL', 'SL', 'HL', 'CCL'].map((c) => (
                      <td key={c} className="num">{b[c] ? <>{num(b[c].available)} <span className="muted">/ {num(b[c].entitled)}</span></> : '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </>
  );
}
