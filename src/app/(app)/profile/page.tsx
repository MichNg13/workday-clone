import type { Metadata } from 'next';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { Avatar, Badge, Card, PageHeader } from '@/components/ui';
import { updateProfile } from '@/app/actions/workflow';
import { fmtDate, ROLE_LABEL, sgToday } from '@/lib/format';
import { requireMe } from '@/lib/session';

export const metadata: Metadata = { title: 'My profile' };

export default async function Profile() {
  const me = await requireMe();
  const start = new Date(me.hire_date);
  const now = new Date(sgToday());
  const months = (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth();
  const service = months >= 12 ? `${Math.floor(months / 12)} yr ${months % 12} mo` : `${Math.max(months, 0)} mo`;
  return (
    <>
      <PageHeader title="My profile" />
      <div className="profile-head card">
        <Avatar name={me.full_name} size={72} />
        <div>
          <h2>{me.full_name}</h2>
          <p>{me.job_title} · {me.department_name ?? '—'}</p>
          <p className="muted">{me.email} · {me.employee_no} <Badge tone="blue">{ROLE_LABEL[me.role]}</Badge></p>
        </div>
      </div>
      <div className="two-col">
        <Card title="Job">
          <dl className="details">
            <div><dt>Manager</dt><dd>{me.manager_name ?? '— (requests go to the Director)'}</dd></div>
            <div><dt>Direct reports</dt><dd>{me.reports}</dd></div>
            <div><dt>Hire date</dt><dd>{fmtDate(me.hire_date)}</dd></div>
            <div><dt>Length of service</dt><dd>{service}</dd></div>
            <div><dt>Location</dt><dd>{me.work_location ?? '—'}</dd></div>
          </dl>
          <p className="muted small">Job details are maintained by HR.</p>
        </Card>
        <Card title="Personal details">
          <ActionForm action={updateProfile} className="form-grid">
            <label className="field"><span>Preferred name</span><input name="preferred_name" defaultValue={me.preferred_name ?? ''} /></label>
            <label className="field"><span>Mobile</span><input name="phone" defaultValue={me.phone ?? ''} placeholder="+65 …" /></label>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
