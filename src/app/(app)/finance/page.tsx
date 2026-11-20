import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { ClaimFlags } from '@/components/Flags';
import { IconDownload } from '@/components/icons';
import { Card, ClaimStatus, Empty, PageHeader, Stat, Tabs } from '@/components/ui';
import { payClaim, returnClaim } from '@/app/actions/workflow';
import { fmtDate, money, sgToday } from '@/lib/format';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Finance' };

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ tab?: string; period?: string }> }) {
  const me = await requireMe();
  if (!me.isFinance && !me.isDirector) notFound();
  const { tab = 'queue', period } = await searchParams;
  const today = sgToday();
  const payroll = period && /^\d{4}-\d{2}$/.test(period) ? period : today.slice(0, 7);
  const supabase = await createClient();

  const [queue, paid, returned] = await Promise.all([
    supabase.from('claims').select('*, employee:employee_id(full_name, employee_no), decider:decided_by(full_name), lines:claim_lines(id)').eq('status', 'approved').order('decided_at'),
    supabase.from('claims').select('*, employee:employee_id(full_name, employee_no), finance:finance_by(full_name)').eq('status', 'paid').eq('payroll_period', payroll).order('paid_date', { ascending: false }),
    supabase.from('claims').select('*, employee:employee_id(full_name), finance:finance_by(full_name)').eq('status', 'returned').order('finance_at', { ascending: false }).limit(50),
  ]);
  const q = queue.data ?? [];
  const p = paid.data ?? [];
  const total = (rows: any[]) => rows.reduce((s, r) => s + Number(r.total_amount), 0);

  return (
    <>
      <PageHeader title="Finance" subtitle="Approved claims arrive here automatically. Pay them in the next payroll, or return them with a remark."
        actions={<a className="btn btn-secondary" href={`/api/export/claims?status=approved`}><IconDownload size={16} /> Export payment queue</a>} />
      <div className="stats">
        <Stat label="Ready to pay" value={q.length} hint={money(total(q))} tone="blue" />
        <Stat label={`Paid in payroll ${payroll}`} value={p.length} hint={money(total(p))} tone="green" />
        <Stat label="Returned (open)" value={(returned.data ?? []).length} tone="red" />
      </div>
      <Tabs current={tab} items={[
        { key: 'queue', label: 'Payment queue', href: '/finance', count: q.length },
        { key: 'paid', label: 'Paid', href: `/finance?tab=paid&period=${payroll}` },
        { key: 'returned', label: 'Returned', href: '/finance?tab=returned' },
      ]} />

      {tab === 'queue' && (q.length === 0 ? <Empty>No approved claims waiting for payment.</Empty> : (
        <div className="inbox">
          {q.map((c) => (
            <article key={c.id} className="inbox-item">
              <header>
                <div className="grow">
                  <h3><Link href={`/expenses/${c.id}`}>{c.reference}</Link> · {c.employee?.full_name} <span className="muted">({c.employee?.employee_no})</span></h3>
                  <p>{c.title} · {(c.lines ?? []).length} line(s) · <strong>{money(c.total_amount, c.currency)}</strong></p>
                  <p className="muted small">Approved by {c.decider?.full_name} on {fmtDate(c.decided_at)}</p>
                </div>
                <ClaimStatus status={c.status} />
              </header>
              <ClaimFlags flags={c.flags} />
              {me.isFinance && c.employee_id !== me.id && (
                <div className="two-col">
                  <ActionForm action={payClaim} className="decision">
                    <input type="hidden" name="id" value={c.id} />
                    <div className="field-row">
                      <label className="field grow"><span>Payment reference</span><input name="payment_reference" placeholder={`PAYROLL-${payroll}`} defaultValue={`PAYROLL-${payroll}`} /></label>
                      <label className="field"><span>Paid on</span><input type="date" name="paid_date" defaultValue={today} /></label>
                      <label className="field"><span>Payroll</span><input name="payroll_period" defaultValue={payroll} size={8} /></label>
                    </div>
                    <SubmitButton>Mark as paid</SubmitButton>
                  </ActionForm>
                  <ActionForm action={returnClaim} className="decision">
                    <input type="hidden" name="id" value={c.id} />
                    <label className="field"><span>Return with remark</span><input name="remark" placeholder="e.g. Receipt for line 2 missing" /></label>
                    <SubmitButton className="btn btn-danger">Return to staff</SubmitButton>
                  </ActionForm>
                </div>
              )}
            </article>
          ))}
        </div>
      ))}

      {tab === 'paid' && (
        <Card title={`Paid · payroll ${payroll}`} action={
          <form className="inline-filters">
            <input type="hidden" name="tab" value="paid" />
            <input type="month" name="period" defaultValue={payroll} />
            <button className="btn btn-secondary">Show</button>
            <a className="btn btn-secondary" href={`/api/export/claims?status=paid&period=${payroll}`}><IconDownload size={16} /> CSV</a>
          </form>
        }>
          {p.length === 0 ? <Empty>No claims paid in {payroll}.</Empty> : (
            <table className="table">
              <thead><tr><th>Ref</th><th>Worker</th><th>Title</th><th>Paid on</th><th>Payment ref</th><th>By</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {p.map((c) => (
                  <tr key={c.id}>
                    <td><Link href={`/expenses/${c.id}`}>{c.reference}</Link></td>
                    <td>{c.employee?.full_name}</td><td>{c.title}</td><td>{fmtDate(c.paid_date)}</td>
                    <td>{c.payment_reference}</td><td>{c.finance?.full_name}</td><td className="num">{money(c.total_amount, '')}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={6}><strong>Total</strong></td><td className="num"><strong>{money(total(p))}</strong></td></tr></tfoot>
            </table>
          )}
        </Card>
      )}

      {tab === 'returned' && (
        <Card title="Returned claims">
          {(returned.data ?? []).length === 0 ? <Empty>No returned claims.</Empty> : (
            <table className="table">
              <thead><tr><th>Ref</th><th>Worker</th><th>Remark</th><th>Returned</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {returned.data!.map((c) => (
                  <tr key={c.id}>
                    <td><Link href={`/expenses/${c.id}`}>{c.reference}</Link></td>
                    <td>{c.employee?.full_name}</td><td>{c.return_remark}</td><td>{fmtDate(c.finance_at)} · {c.finance?.full_name}</td>
                    <td className="num">{money(c.total_amount, '')}</td>
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
