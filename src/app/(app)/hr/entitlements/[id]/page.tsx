import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { Timeline } from '@/components/Timeline';
import { Card, PageHeader } from '@/components/ui';
import { updateEntitlement } from '@/app/actions/hr';
import { fmtDate, num, sgToday } from '@/lib/format';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Edit entitlements' };

export default async function EditEntitlements({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ year?: string }> }) {
  const me = await requireMe();
  if (!me.isHR) notFound();
  const { id } = await params;
  const year = Number((await searchParams).year) || Number(sgToday().slice(0, 4));
  const supabase = await createClient();
  const [{ data: emp }, { data: bal }, { data: log }] = await Promise.all([
    supabase.from('employees').select('*, department:department_id(name)').eq('id', id).maybeSingle(),
    supabase.from('leave_balances').select('*, type:leave_type_code(name, sort_order)').eq('employee_id', id).eq('year', year),
    supabase.from('audit_log').select('*, actor:actor_id(full_name)').eq('entity_type', 'entitlement').eq('entity_id', id).order('created_at', { ascending: false }).limit(20),
  ]);
  if (!emp) notFound();
  const rows = (bal ?? []).sort((a, b) => (a.type?.sort_order ?? 0) - (b.type?.sort_order ?? 0));

  return (
    <>
      <PageHeader back={{ href: `/hr?year=${year}`, label: 'Master Leave Record' }} title={`${emp.full_name} · ${year}`}
        subtitle={`${emp.job_title} · ${emp.department?.name ?? ''} · hired ${fmtDate(emp.hire_date)}`} />
      <Card title="Contract entitlements">
        <div className="ent-grid">
          {rows.map((b) => (
            <ActionForm key={b.entitlement_id} action={updateEntitlement} className="ent-card">
              <input type="hidden" name="id" value={b.entitlement_id} />
              <h3>{b.type?.name}</h3>
              <p className="muted small">Taken {num(b.taken)} · pending {num(b.pending)}{Number(b.linked) ? ` · sick leave ${num(b.linked)}` : ''} · <strong>available {num(b.available)}</strong></p>
              <div className="field-row">
                <label className="field"><span>Entitled</span><input name="entitled_days" type="number" step="0.5" defaultValue={b.entitled_days} /></label>
                <label className="field"><span>Carried fwd</span><input name="carried_forward" type="number" step="0.5" defaultValue={b.carried_forward} /></label>
                <label className="field"><span>Adjustment</span><input name="adjustment" type="number" step="0.5" defaultValue={b.adjustment} /></label>
              </div>
              <label className="field"><span>Note</span><input name="note" defaultValue={b.note ?? ''} placeholder="Reason for change" /></label>
              <SubmitButton className="btn btn-secondary">Save</SubmitButton>
            </ActionForm>
          ))}
        </div>
      </Card>
      <Card title="Change history"><Timeline events={(log ?? []).map((e) => ({ ...e, action: e.action === 'entitlement_changed' ? `Changed ${e.reference}: ${e.details?.from?.entitled}+${e.details?.from?.carried}+${e.details?.from?.adjustment} → ${e.details?.to?.entitled}+${e.details?.to?.carried}+${e.details?.to?.adjustment}` : e.action }))} /></Card>
    </>
  );
}
