import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { Card, PageHeader } from '@/components/ui';
import { addHoliday, deleteHoliday, updateCategory, updateLeaveType, updateSetting } from '@/app/actions/hr';
import { fmtDate, money, sgToday } from '@/lib/format';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { HrTabs } from '../HrTabs';

export const metadata: Metadata = { title: 'Policies & Holidays' };

export default async function Policies() {
  const me = await requireMe();
  if (!me.canSeeHR) notFound();
  const supabase = await createClient();
  const today = sgToday();
  const [types, holidays, cats, settings] = await Promise.all([
    supabase.from('leave_types').select('*').order('sort_order'),
    supabase.from('public_holidays').select('*').gte('holiday_date', `${today.slice(0, 4)}-01-01`).order('holiday_date'),
    supabase.from('claim_categories').select('*').order('sort_order'),
    supabase.from('app_settings').select('*').order('key'),
  ]);
  const edit = me.isHR;
  const editCats = me.isHR || me.isFinance;

  return (
    <>
      <PageHeader title="HR" subtitle="Replace the defaults with your contract and finance policy figures." />
      <HrTabs current="policies" />
      <Card title="Leave types">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Code</th><th>Name</th><th>Rules</th><th className="num">Default days</th><th className="num">Notice (days)</th><th>Active</th><th /></tr></thead>
            <tbody>
              {(types.data ?? []).map((t) => (
                <tr key={t.code}>
                  <td><span className="type-dot" style={{ background: t.color }} />{t.code}</td>
                  <td>{t.name}</td>
                  <td className="small">
                    {[t.prorate_for_joiners && 'pro-rated for joiners', t.requires_document && `needs ${t.document_label}`,
                      t.counts_toward_code && `counts toward ${t.counts_toward_code} cap`, t.requires_exhausted_code && `only after ${t.requires_exhausted_code} used up`,
                      !t.track_balance && 'no balance', t.allow_half_day && 'half days', t.allow_backdate && 'can be backdated']
                      .filter(Boolean).join(' · ')}
                  </td>
                  <td colSpan={4}>
                    <ActionForm action={updateLeaveType} className="row-form">
                      <input type="hidden" name="code" value={t.code} />
                      <input name="default_days" type="number" step="0.5" defaultValue={t.default_days} disabled={!edit} aria-label="Default days" />
                      <input name="min_notice_days" type="number" defaultValue={t.min_notice_days} disabled={!edit} aria-label="Notice days" />
                      <input name="is_active" type="checkbox" defaultChecked={t.is_active} disabled={!edit} aria-label="Active" />
                      {edit && <SubmitButton className="btn btn-secondary btn-sm">Save</SubmitButton>}
                    </ActionForm>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="two-col">
        <Card title="Public holidays (MOM)">
          <ul className="mini-list plain">
            {(holidays.data ?? []).map((h) => (
              <li key={h.holiday_date}>
                <span><strong>{fmtDate(h.holiday_date, { weekday: 'short' })}</strong> · {h.name}</span>
                {edit && (
                  <ActionForm action={deleteHoliday}>
                    <input type="hidden" name="holiday_date" value={h.holiday_date} />
                    <SubmitButton className="btn-icon" pendingText="…">✕</SubmitButton>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
          {edit && (
            <ActionForm action={addHoliday} className="row-form" resetOnSuccess>
              <input type="date" name="holiday_date" required aria-label="Date" />
              <input name="name" placeholder="Holiday name" required aria-label="Name" />
              <SubmitButton className="btn btn-secondary btn-sm">Add</SubmitButton>
            </ActionForm>
          )}
        </Card>
        <Card title="Workflow settings">
          {(settings.data ?? []).map((st) => (
            <ActionForm key={st.key} action={updateSetting} className="row-form setting">
              <input type="hidden" name="key" value={st.key} />
              <span>{st.description}</span>
              <input name="value" type="number" defaultValue={Number(st.value)} disabled={!edit} aria-label={st.key} />
              {edit && <SubmitButton className="btn btn-secondary btn-sm">Save</SubmitButton>}
            </ActionForm>
          ))}
        </Card>
      </div>

      <Card title="Claim categories & limits">
        <p className="muted small">Lines over the limit are flagged to the approver, not blocked.</p>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Code</th><th>Category</th><th>GL</th><th>Limit per line · receipt required · active</th></tr></thead>
            <tbody>
              {(cats.data ?? []).map((c) => (
                <tr key={c.code}>
                  <td>{c.code}</td>
                  <td>{c.name}<div className="muted small">{c.per_line_limit ? `Limit ${money(c.per_line_limit)}` : 'No limit'}</div></td>
                  <td>{c.gl_code}</td>
                  <td>
                    <ActionForm action={updateCategory} className="row-form">
                      <input type="hidden" name="code" value={c.code} />
                      <input name="per_line_limit" type="number" step="0.01" defaultValue={c.per_line_limit ?? ''} placeholder="No limit" disabled={!editCats} aria-label="Limit" />
                      <label className="check-inline"><input name="requires_receipt" type="checkbox" defaultChecked={c.requires_receipt} disabled={!editCats} /> receipt</label>
                      <label className="check-inline"><input name="is_active" type="checkbox" defaultChecked={c.is_active} disabled={!editCats} /> active</label>
                      {editCats && <SubmitButton className="btn btn-secondary btn-sm">Save</SubmitButton>}
                    </ActionForm>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
