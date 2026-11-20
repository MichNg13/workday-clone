import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { ClaimFlags } from '@/components/Flags';
import { Timeline } from '@/components/Timeline';
import { Card, ClaimStatus, PageHeader } from '@/components/ui';
import { cancelClaim, decideClaim, payClaim, returnClaim } from '@/app/actions/workflow';
import { fmtDate, fmtDateTime, money, sgToday } from '@/lib/format';
import { requireMe } from '@/lib/session';
import { signedUrls } from '@/lib/storage';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Expense report' };

export default async function ClaimDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ submitted?: string }> }) {
  const me = await requireMe();
  const { id } = await params;
  const { submitted } = await searchParams;
  const supabase = await createClient();
  const { data: c } = await supabase
    .from('claims')
    .select('*, employee:employee_id(full_name, job_title), approver:approver_id(full_name), escalated:escalated_to_id(full_name), decider:decided_by(full_name), finance:finance_by(full_name), lines:claim_lines(*, category:category_code(name))')
    .eq('id', id)
    .maybeSingle();
  if (!c) notFound();
  const { data: events } = await supabase.from('audit_log').select('*, actor:actor_id(full_name)').eq('entity_type', 'claim').eq('entity_id', id).order('created_at');
  const lines = (c.lines ?? []).sort((a: any, b: any) => a.line_no - b.line_no);
  const urls = await signedUrls(lines.map((l: any) => l.attachment_path));
  const isMine = c.employee_id === me.id;
  const canDecide = c.status === 'pending' && !isMine && (c.approver_id === me.id || c.escalated_to_id === me.id);
  const canPay = c.status === 'approved' && me.isFinance && !isMine;
  const today = sgToday();

  return (
    <>
      <PageHeader
        back={{ href: isMine ? '/expenses' : canPay ? '/finance' : '/inbox', label: isMine ? 'Expenses' : canPay ? 'Finance' : 'Inbox' }}
        title={<>{c.title} <span className="muted">· {c.reference}</span></>}
        subtitle={`${c.employee?.full_name} · ${c.employee?.job_title}`}
        actions={<ClaimStatus status={c.status} />}
      />
      {submitted && c.status === 'pending' && <div className="alert alert-success">Claim submitted to {c.approver?.full_name}.</div>}
      {isMine && ['returned', 'rejected'].includes(c.status) && (
        <div className="alert alert-warn">
          {c.status === 'returned' ? `Finance returned this claim: “${c.return_remark}”.` : `Rejected: “${c.decision_remark}”.`}{' '}
          <Link className="link" href={`/expenses/new?resubmit=${c.id}`}>Fix and resubmit</Link>
        </div>
      )}
      <div className="two-col wide-left">
        <div>
          <Card title="Expense lines">
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>#</th><th>Date</th><th>Category</th><th>Description</th><th>Receipt</th><th className="num">Amount</th></tr></thead>
                <tbody>
                  {lines.map((l: any) => (
                    <tr key={l.id}>
                      <td>{l.line_no}</td>
                      <td>{fmtDate(l.expense_date)}</td>
                      <td>{l.category?.name}</td>
                      <td>{l.description}</td>
                      <td>{l.receipt_no ?? '—'}{l.attachment_path && urls[l.attachment_path] && <> · <a className="link" href={urls[l.attachment_path]} target="_blank" rel="noreferrer">view</a></>}</td>
                      <td className="num">{money(l.amount, '')}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={5}><strong>Total</strong></td><td className="num"><strong>{money(c.total_amount, c.currency)}</strong></td></tr></tfoot>
              </table>
            </div>
            <ClaimFlags flags={c.flags} />
          </Card>
          <Card title="Details">
            <dl className="details">
              <div><dt>Purpose</dt><dd>{c.purpose ?? '—'}</dd></div>
              <div><dt>Declaration</dt><dd>Accepted {fmtDateTime(c.declaration_at)}</dd></div>
              <div><dt>Approver</dt><dd>{c.approver?.full_name ?? '—'}{c.escalated?.full_name ? ` → escalated to ${c.escalated.full_name}` : ''}</dd></div>
              {c.decided_at && <div><dt>Decision</dt><dd>{fmtDateTime(c.decided_at)} by {c.decider?.full_name}{c.decision_remark ? ` · “${c.decision_remark}”` : ''}</dd></div>}
              {c.paid_date && <div><dt>Payment</dt><dd>{fmtDate(c.paid_date)} · ref {c.payment_reference} · payroll {c.payroll_period} · by {c.finance?.full_name}</dd></div>}
            </dl>
            {canDecide && (
              <ActionForm action={decideClaim} className="decision">
                <input type="hidden" name="id" value={c.id} />
                <textarea name="remark" placeholder="Remark (required if rejecting)" rows={2} />
                <div className="decision-buttons">
                  <SubmitButton name="decision" value="approve">Approve &amp; send to Finance</SubmitButton>
                  <SubmitButton name="decision" value="reject" className="btn btn-danger">Reject</SubmitButton>
                </div>
              </ActionForm>
            )}
            {canPay && (
              <div className="two-col">
                <ActionForm action={payClaim} className="decision">
                  <input type="hidden" name="id" value={c.id} />
                  <label className="field"><span>Payment reference</span><input name="payment_reference" placeholder={`PAYROLL-${today.slice(0, 7)}`} /></label>
                  <div className="field-row">
                    <label className="field"><span>Paid on</span><input type="date" name="paid_date" defaultValue={today} /></label>
                    <label className="field"><span>Payroll</span><input name="payroll_period" defaultValue={today.slice(0, 7)} /></label>
                  </div>
                  <SubmitButton>Mark as paid</SubmitButton>
                </ActionForm>
                <ActionForm action={returnClaim} className="decision">
                  <input type="hidden" name="id" value={c.id} />
                  <label className="field"><span>Return to staff with remark</span><textarea name="remark" rows={3} placeholder="e.g. Receipt for line 2 is missing" /></label>
                  <SubmitButton className="btn btn-danger">Return claim</SubmitButton>
                </ActionForm>
              </div>
            )}
            {isMine && ['pending', 'returned', 'rejected'].includes(c.status) && (
              <ActionForm action={cancelClaim} className="decision">
                <input type="hidden" name="id" value={c.id} />
                <SubmitButton className="btn btn-secondary">Cancel this claim</SubmitButton>
              </ActionForm>
            )}
          </Card>
        </div>
        <Card title="Audit trail"><Timeline events={events ?? []} /></Card>
      </div>
    </>
  );
}
