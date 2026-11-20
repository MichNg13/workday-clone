import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { BalanceLine, ClaimFlags, LeaveFlags } from '@/components/Flags';
import { IconFile } from '@/components/icons';
import { Avatar, Badge, Empty, PageHeader, Tabs } from '@/components/ui';
import { decideClaim, decideLeave } from '@/app/actions/workflow';
import { days, fmtDate, fmtRange, money, timeAgo } from '@/lib/format';
import { requireMe } from '@/lib/session';
import { signedUrls } from '@/lib/storage';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Inbox' };

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireMe();
  const { tab = 'all' } = await searchParams;
  const supabase = await createClient();
  const mine = `approver_id.eq.${me.id},escalated_to_id.eq.${me.id}`;

  const [leave, claims, done] = await Promise.all([
    supabase.from('leave_requests')
      .select('*, employee:employee_id(full_name, job_title, department:department_id(name)), type:leave_type_code(name, color), approver:approver_id(full_name)')
      .eq('status', 'pending').or(mine).neq('employee_id', me.id).order('submitted_at'),
    supabase.from('claims')
      .select('*, employee:employee_id(full_name, job_title), approver:approver_id(full_name), lines:claim_lines(*, category:category_code(name))')
      .eq('status', 'pending').or(mine).neq('employee_id', me.id).order('submitted_at'),
    supabase.from('audit_log').select('*').eq('actor_id', me.id).in('action', ['approved', 'rejected']).order('created_at', { ascending: false }).limit(10),
  ]);

  const leaveRows = leave.data ?? [];
  const claimRows = claims.data ?? [];
  const urls = await signedUrls([
    ...leaveRows.map((r) => r.attachment_path),
    ...claimRows.flatMap((c) => (c.lines ?? []).map((l: any) => l.attachment_path)),
  ]);

  const showLeave = tab === 'all' || tab === 'leave';
  const showClaims = tab === 'all' || tab === 'claims';

  return (
    <>
      <PageHeader title="Inbox" subtitle="Requests waiting for your decision. Requests are escalated to your manager after 2 working days." />
      <Tabs current={tab} items={[
        { key: 'all', label: 'All', href: '/inbox', count: leaveRows.length + claimRows.length },
        { key: 'leave', label: 'Time Off', href: '/inbox?tab=leave', count: leaveRows.length },
        { key: 'claims', label: 'Expense Reports', href: '/inbox?tab=claims', count: claimRows.length },
        { key: 'history', label: 'Recently decided', href: '/inbox?tab=history' },
      ]} />

      {tab === 'history' ? (
        (done.data ?? []).length === 0 ? <Empty>You haven&apos;t decided anything yet.</Empty> : (
          <table className="table">
            <thead><tr><th>Reference</th><th>Decision</th><th>Remark</th><th>When</th></tr></thead>
            <tbody>
              {done.data!.map((e) => (
                <tr key={e.id}>
                  <td><Link href={e.entity_type === 'leave' ? `/time-off/${e.entity_id}` : `/expenses/${e.entity_id}`}>{e.reference}</Link></td>
                  <td><Badge tone={e.action === 'approved' ? 'green' : 'red'}>{e.action}</Badge></td>
                  <td>{e.remark ?? '—'}</td>
                  <td>{timeAgo(e.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : (
        <div className="inbox">
          {showLeave && leaveRows.map((r) => (
            <article key={r.id} className="inbox-item">
              <header>
                <Avatar name={r.employee?.full_name ?? '?'} />
                <div className="grow">
                  <h3>{r.employee?.full_name} <span className="muted">· {r.employee?.job_title}{r.employee?.department?.name ? `, ${r.employee.department.name}` : ''}</span></h3>
                  <p>
                    <span className="type-dot" style={{ background: r.type?.color }} />
                    <strong>{r.type?.name}</strong> · {fmtRange(r.start_date, r.end_date, r.day_part)} · <strong>{days(r.days)}</strong>
                  </p>
                </div>
                <div className="inbox-meta">
                  <Link href={`/time-off/${r.id}`}>{r.reference}</Link>
                  <span className="muted small">Submitted {timeAgo(r.submitted_at)}</span>
                  {r.escalated_to_id === me.id && <Badge tone="red">Escalated to you from {r.approver?.full_name}</Badge>}
                  {r.escalated_to_id && r.escalated_to_id !== me.id && <Badge tone="red">Escalated</Badge>}
                </div>
              </header>
              <div className="inbox-body">
                <BalanceLine flags={r.flags} />
                {r.reason && <p><span className="label">Reason</span> {r.reason}</p>}
                {r.document_ref && <p><span className="label">MC / document no.</span> {r.document_ref}</p>}
                {r.attachment_path && urls[r.attachment_path] && (
                  <p><a href={urls[r.attachment_path]} target="_blank" rel="noreferrer" className="link"><IconFile size={14} /> View attachment</a></p>
                )}
                <LeaveFlags flags={r.flags} />
              </div>
              <ActionForm action={decideLeave} className="decision">
                <input type="hidden" name="id" value={r.id} />
                <textarea name="remark" placeholder="Remark (required if rejecting)" rows={2} maxLength={500} />
                <div className="decision-buttons">
                  <SubmitButton name="decision" value="approve" className="btn btn-primary" pendingText="Saving…">Approve</SubmitButton>
                  <SubmitButton name="decision" value="reject" className="btn btn-danger" pendingText="Saving…">Reject</SubmitButton>
                </div>
              </ActionForm>
            </article>
          ))}

          {showClaims && claimRows.map((c) => (
            <article key={c.id} className="inbox-item">
              <header>
                <Avatar name={c.employee?.full_name ?? '?'} />
                <div className="grow">
                  <h3>{c.employee?.full_name} <span className="muted">· {c.employee?.job_title}</span></h3>
                  <p><strong>Expense report:</strong> {c.title} · <strong>{money(c.total_amount, c.currency)}</strong></p>
                </div>
                <div className="inbox-meta">
                  <Link href={`/expenses/${c.id}`}>{c.reference}</Link>
                  <span className="muted small">Submitted {timeAgo(c.submitted_at)}</span>
                  {c.escalated_to_id === me.id && <Badge tone="red">Escalated to you from {c.approver?.full_name}</Badge>}
                </div>
              </header>
              <div className="inbox-body">
                {c.purpose && <p><span className="label">Purpose</span> {c.purpose}</p>}
                <table className="table compact">
                  <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Receipt</th><th className="num">Amount</th></tr></thead>
                  <tbody>
                    {(c.lines ?? []).sort((a: any, b: any) => a.line_no - b.line_no).map((l: any) => (
                      <tr key={l.id}>
                        <td>{fmtDate(l.expense_date, { year: undefined })}</td>
                        <td>{l.category?.name}</td>
                        <td>{l.description}</td>
                        <td>
                          {l.receipt_no ?? '—'}
                          {l.attachment_path && urls[l.attachment_path] && <> · <a href={urls[l.attachment_path]} target="_blank" rel="noreferrer" className="link">view</a></>}
                        </td>
                        <td className="num">{money(l.amount, '')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ClaimFlags flags={c.flags} />
              </div>
              <ActionForm action={decideClaim} className="decision">
                <input type="hidden" name="id" value={c.id} />
                <textarea name="remark" placeholder="Remark (required if rejecting)" rows={2} maxLength={500} />
                <div className="decision-buttons">
                  <SubmitButton name="decision" value="approve" className="btn btn-primary" pendingText="Saving…">Approve &amp; send to Finance</SubmitButton>
                  <SubmitButton name="decision" value="reject" className="btn btn-danger" pendingText="Saving…">Reject</SubmitButton>
                </div>
              </ActionForm>
            </article>
          ))}

          {((showLeave ? leaveRows.length : 0) + (showClaims ? claimRows.length : 0)) === 0 && (
            <Empty>Nothing awaiting your action. You are all caught up.</Empty>
          )}
        </div>
      )}
    </>
  );
}
