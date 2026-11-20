import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { IconDownload } from '@/components/icons';
import { Card, Empty, LeaveStatus, PageHeader } from '@/components/ui';
import { fmtDate, fmtRange, monthBounds, num, sgToday } from '@/lib/format';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { HrTabs } from '../HrTabs';

export const metadata: Metadata = { title: 'Leave Tracker' };

export default async function Tracker({ searchParams }: { searchParams: Promise<{ month?: string; status?: string; type?: string; dept?: string }> }) {
  const me = await requireMe();
  if (!me.canSeeHR) notFound();
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : sgToday().slice(0, 7);
  const { from, to } = monthBounds(month);
  const supabase = await createClient();

  let q = supabase.from('leave_requests')
    .select('*, employee:employee_id(full_name, employee_no, department_id, department:department_id(name)), type:leave_type_code(name, color), approver:approver_id(full_name), decider:decided_by(full_name)')
    .lte('start_date', to).gte('end_date', from).order('start_date');
  if (sp.status) q = q.eq('status', sp.status);
  if (sp.type) q = q.eq('leave_type_code', sp.type);
  const [{ data }, types, depts] = await Promise.all([
    q,
    supabase.from('leave_types').select('code, name').order('sort_order'),
    supabase.from('departments').select('id, name').order('name'),
  ]);
  const rows = (data ?? []).filter((r) => !sp.dept || r.employee?.department_id === sp.dept);
  const qs = new URLSearchParams({ month, ...(sp.status ? { status: sp.status } : {}), ...(sp.type ? { type: sp.type } : {}), ...(sp.dept ? { dept: sp.dept } : {}) });

  return (
    <>
      <PageHeader title="HR" subtitle="Live leave tracker — every request, written automatically when it is submitted and decided."
        actions={<a className="btn btn-secondary" href={`/api/export/leave?${qs}`}><IconDownload size={16} /> Export CSV for payroll</a>} />
      <HrTabs current="tracker" />
      <Card
        title={`Leave overlapping ${fmtDate(from, { day: undefined, month: 'long' })}`}
        action={
          <form className="inline-filters">
            <input type="month" name="month" defaultValue={month} />
            <select name="status" defaultValue={sp.status ?? ''}>
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select name="type" defaultValue={sp.type ?? ''}>
              <option value="">All types</option>
              {(types.data ?? []).map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
            </select>
            <select name="dept" defaultValue={sp.dept ?? ''}>
              <option value="">All departments</option>
              {(depts.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <button className="btn btn-secondary">Apply</button>
          </form>
        }
      >
        {rows.length === 0 ? <Empty>No leave matches these filters.</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Ref</th><th>Worker</th><th>Dept</th><th>Type</th><th>Dates</th><th className="num">Days</th><th>MC no.</th><th>Approver</th><th>Decided</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/time-off/${r.id}`}>{r.reference}</Link></td>
                    <td>{r.employee?.full_name}</td>
                    <td>{r.employee?.department?.name ?? '—'}</td>
                    <td><span className="type-dot" style={{ background: r.type?.color }} />{r.type?.name}</td>
                    <td>{fmtRange(r.start_date, r.end_date, r.day_part)}</td>
                    <td className="num">{num(r.days)}</td>
                    <td>{r.document_ref ?? '—'}</td>
                    <td>{r.approver?.full_name ?? '—'}</td>
                    <td>{r.decided_at ? `${fmtDate(r.decided_at)} · ${r.decider?.full_name ?? ''}` : '—'}</td>
                    <td><LeaveStatus status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small">{rows.length} request(s) · {num(rows.filter((r) => r.status === 'approved').reduce((s, r) => s + Number(r.days), 0))} approved day(s)</p>
      </Card>
    </>
  );
}
