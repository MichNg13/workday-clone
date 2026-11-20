import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, ClaimStatus, Empty, PageHeader, Stat } from '@/components/ui';
import { fmtDate, money } from '@/lib/format';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Expenses' };

export default async function ExpensesPage() {
  const me = await requireMe();
  const supabase = await createClient();
  const { data } = await supabase.from('claims').select('*, approver:approver_id(full_name)').eq('employee_id', me.id).order('submitted_at', { ascending: false });
  const rows = data ?? [];
  const sum = (s: string[]) => rows.filter((r) => s.includes(r.status)).reduce((a, r) => a + Number(r.total_amount), 0);

  return (
    <>
      <PageHeader title="Expenses" subtitle="Approved claims go straight to Finance and are paid in the next payroll."
        actions={<Link href="/expenses/new" className="btn btn-primary">Create Expense Report</Link>} />
      <div className="stats">
        <Stat label="Awaiting approval" value={money(sum(['pending']))} />
        <Stat label="With Finance" value={money(sum(['approved']))} tone="blue" />
        <Stat label="Needs your action" value={rows.filter((r) => ['returned', 'rejected'].includes(r.status)).length} tone="red" hint="Returned or rejected" />
        <Stat label="Paid (all time)" value={money(sum(['paid']))} tone="green" />
      </div>
      <Card title="My Expense Reports">
        {rows.length === 0 ? <Empty>No expense reports yet.</Empty> : (
          <table className="table">
            <thead><tr><th>Reference</th><th>Title</th><th>Submitted</th><th>Approver</th><th className="num">Total</th><th>Status</th><th>Paid</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/expenses/${c.id}`}>{c.reference}</Link></td>
                  <td>{c.title}</td>
                  <td>{fmtDate(c.submitted_at)}</td>
                  <td>{c.approver?.full_name ?? '—'}</td>
                  <td className="num">{money(c.total_amount, c.currency)}</td>
                  <td><ClaimStatus status={c.status} /></td>
                  <td>{c.paid_date ? `${fmtDate(c.paid_date)} · ${c.payment_reference}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
