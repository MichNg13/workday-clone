import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { IconDownload } from '@/components/icons';
import { Card, PageHeader } from '@/components/ui';
import { generateEntitlements } from '@/app/actions/hr';
import { fmtDate, num, sgToday } from '@/lib/format';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { HrTabs } from './HrTabs';

export const metadata: Metadata = { title: 'Master Leave Record' };

export default async function HrHome({ searchParams }: { searchParams: Promise<{ year?: string; dept?: string }> }) {
  const me = await requireMe();
  if (!me.canSeeHR) notFound();
  const sp = await searchParams;
  const year = Number(sp.year) || Number(sgToday().slice(0, 4));
  const supabase = await createClient();

  const [types, emps, bal, depts] = await Promise.all([
    supabase.from('leave_types').select('code, name, color').eq('track_balance', true).eq('is_active', true).order('sort_order'),
    supabase.from('employees').select('id, employee_no, full_name, hire_date, department_id, department:department_id(name)').eq('is_active', true).order('full_name'),
    supabase.from('leave_balances').select('*').eq('year', year),
    supabase.from('departments').select('id, name').order('name'),
  ]);
  const map = new Map<string, any>();
  (bal.data ?? []).forEach((b) => map.set(`${b.employee_id}:${b.leave_type_code}`, b));
  const rows = (emps.data ?? []).filter((e) => !sp.dept || e.department_id === sp.dept);

  return (
    <>
      <PageHeader title="HR" subtitle="Balance = contract entitlement − approved − pending. Updated automatically on every approval; nothing is re-keyed."
        actions={<a className="btn btn-secondary" href={`/api/export/balances?year=${year}`}><IconDownload size={16} /> Export CSV</a>} />
      <HrTabs current="record" />
      <Card
        title={`Master Leave Record ${year}`}
        action={
          <form className="inline-filters">
            <select name="year" defaultValue={year}>
              {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <select name="dept" defaultValue={sp.dept ?? ''}>
              <option value="">All departments</option>
              {(depts.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <button className="btn btn-secondary">Apply</button>
          </form>
        }
      >
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Worker</th><th>Department</th><th>Hired</th>
                {(types.data ?? []).map((t) => <th key={t.code} className="num" title={t.name}><span className="type-dot" style={{ background: t.color }} />{t.code}</th>)}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td><strong>{e.full_name}</strong> <span className="muted small">{e.employee_no}</span></td>
                  <td>{e.department?.name ?? '—'}</td>
                  <td>{fmtDate(e.hire_date)}</td>
                  {(types.data ?? []).map((t) => {
                    const b = map.get(`${e.id}:${t.code}`);
                    return (
                      <td key={t.code} className="num" title={b ? `Taken ${num(b.taken)} · pending ${num(b.pending)}${Number(b.linked) ? ` · used by sick leave ${num(b.linked)}` : ''}` : ''}>
                        {b ? <>{num(b.available)}<span className="muted">/{num(b.entitled)}</span>{Number(b.pending) > 0 && <sup className="pend">{num(b.pending)}p</sup>}</> : '—'}
                      </td>
                    );
                  })}
                  <td>{me.isHR && <Link className="link" href={`/hr/entitlements/${e.id}?year=${year}`}>Edit</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">Shown as available / entitled. “p” = days pending approval. Hover a cell for details.</p>
      </Card>
      {me.isHR && (
        <Card title="Year-end">
          <ActionForm action={generateEntitlements} className="inline-form">
            <input type="hidden" name="year" value={year + 1} />
            <span>Create {year + 1} entitlements for all active workers from the leave policy (pro-rated for joiners). Existing rows are not changed.</span>
            <SubmitButton className="btn btn-secondary">Generate {year + 1}</SubmitButton>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
