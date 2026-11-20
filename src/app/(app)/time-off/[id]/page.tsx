import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { BalanceLine, LeaveFlags } from '@/components/Flags';
import { Timeline } from '@/components/Timeline';
import { Card, LeaveStatus, PageHeader } from '@/components/ui';
import { cancelLeave, decideLeave } from '@/app/actions/workflow';
import { days, fmtDateTime, fmtRange, sgToday } from '@/lib/format';
import { requireMe } from '@/lib/session';
import { signedUrls } from '@/lib/storage';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Time off request' };

export default async function LeaveDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ submitted?: string }> }) {
  const me = await requireMe();
  const { id } = await params;
  const { submitted } = await searchParams;
  const supabase = await createClient();
  const { data: r } = await supabase
    .from('leave_requests')
    .select('*, employee:employee_id(full_name, job_title), type:leave_type_code(name, color), approver:approver_id(full_name), escalated:escalated_to_id(full_name), decider:decided_by(full_name)')
    .eq('id', id)
    .maybeSingle();
  if (!r) notFound();
  const { data: events } = await supabase.from('audit_log').select('*, actor:actor_id(full_name)').eq('entity_type', 'leave').eq('entity_id', id).order('created_at');
  const urls = await signedUrls([r.attachment_path]);

  const isMine = r.employee_id === me.id;
  const canDecide = r.status === 'pending' && !isMine && (r.approver_id === me.id || r.escalated_to_id === me.id);
  const canCancel = (isMine || me.isHR) && (r.status === 'pending' || (r.status === 'approved' && (r.start_date > sgToday() || me.isHR)));

  return (
    <>
      <PageHeader
        back={{ href: isMine ? '/time-off' : '/inbox', label: isMine ? 'Time Off' : 'Inbox' }}
        title={<>{r.type?.name} <span className="muted">· {r.reference}</span></>}
        subtitle={`${r.employee?.full_name} · ${r.employee?.job_title}`}
        actions={<LeaveStatus status={r.status} />}
      />
      {submitted && r.status === 'pending' && (
        <div className="alert alert-success">Request submitted. {r.approver?.full_name} has been notified and will be reminded after 1 working day.</div>
      )}
      <div className="two-col wide-left">
        <Card title="Details">
          <dl className="details">
            <div><dt>Dates</dt><dd>{fmtRange(r.start_date, r.end_date, r.day_part)}</dd></div>
            <div><dt>Working days</dt><dd>{days(r.days)}</dd></div>
            <div><dt>Balance</dt><dd><BalanceLine flags={r.flags} /></dd></div>
            <div><dt>Reason</dt><dd>{r.reason ?? '—'}</dd></div>
            {r.document_ref && <div><dt>MC / document no.</dt><dd>{r.document_ref}</dd></div>}
            {r.attachment_path && <div><dt>Attachment</dt><dd>{urls[r.attachment_path] ? <a className="link" href={urls[r.attachment_path]} target="_blank" rel="noreferrer">Open file</a> : 'Stored'}</dd></div>}
            <div><dt>Approver</dt><dd>{r.approver?.full_name ?? '—'}{r.escalated?.full_name ? ` → escalated to ${r.escalated.full_name}` : ''}</dd></div>
            <div><dt>Submitted</dt><dd>{fmtDateTime(r.submitted_at)}</dd></div>
            {r.decided_at && <div><dt>Decided</dt><dd>{fmtDateTime(r.decided_at)} by {r.decider?.full_name}</dd></div>}
            {r.decision_remark && <div><dt>Remark</dt><dd>{r.decision_remark}</dd></div>}
          </dl>
          <LeaveFlags flags={r.flags} />

          {canDecide && (
            <ActionForm action={decideLeave} className="decision">
              <input type="hidden" name="id" value={r.id} />
              <textarea name="remark" placeholder="Remark (required if rejecting)" rows={2} />
              <div className="decision-buttons">
                <SubmitButton name="decision" value="approve">Approve</SubmitButton>
                <SubmitButton name="decision" value="reject" className="btn btn-danger">Reject</SubmitButton>
              </div>
            </ActionForm>
          )}
          {canCancel && (
            <ActionForm action={cancelLeave} className="decision">
              <input type="hidden" name="id" value={r.id} />
              <input name="remark" placeholder="Reason for cancelling (optional)" />
              <div className="decision-buttons">
                <SubmitButton className="btn btn-secondary" pendingText="Cancelling…">Cancel this request</SubmitButton>
              </div>
            </ActionForm>
          )}
        </Card>
        <Card title="Audit trail">
          <Timeline events={events ?? []} />
        </Card>
      </div>
    </>
  );
}
