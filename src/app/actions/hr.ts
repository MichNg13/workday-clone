'use server';
import { revalidatePath } from 'next/cache';
import type { ActionState } from '@/components/ActionForm';
import { createClient } from '@/lib/supabase/server';

const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};
const n = (fd: FormData, k: string) => {
  const v = Number(s(fd, k));
  return Number.isFinite(v) ? v : 0;
};

export async function updateEntitlement(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('leave_entitlements')
    .update({ entitled_days: n(fd, 'entitled_days'), carried_forward: n(fd, 'carried_forward'), adjustment: n(fd, 'adjustment'), note: s(fd, 'note') || null }, { count: 'exact' })
    .eq('id', s(fd, 'id'));
  if (error) return { error: error.message };
  if (!count) return { error: 'Only HR can change entitlements.' };
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Entitlement saved. Balance recalculated.' };
}

export async function generateEntitlements(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const year = n(fd, 'year');
  const { data, error } = await supabase.rpc('generate_entitlements', { p_year: year });
  if (error) return { error: error.message };
  revalidatePath('/', 'layout');
  return { ok: true, message: `Entitlements for ${year} generated for ${data} workers (existing rows kept).` };
}

export async function saveWorker(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const id = s(fd, 'id');
  const row = {
    employee_no: s(fd, 'employee_no'),
    full_name: s(fd, 'full_name'),
    email: s(fd, 'email').toLowerCase(),
    job_title: s(fd, 'job_title') || 'Staff',
    department_id: s(fd, 'department_id') || null,
    manager_id: s(fd, 'manager_id') || null,
    role: s(fd, 'role') || 'employee',
    hire_date: s(fd, 'hire_date'),
    is_active: fd.get('is_active') === 'on',
  };
  if (!row.employee_no || !row.full_name || !row.email || !row.hire_date) return { error: 'Employee no., name, email and hire date are required.' };
  if (id && row.manager_id === id) return { error: 'A worker cannot be their own manager.' };
  const res = id
    ? await supabase.from('employees').update(row, { count: 'exact' }).eq('id', id)
    : await supabase.from('employees').insert(row, { count: 'exact' });
  if (res.error) {
    if (res.error.code === '23505') return { error: 'That employee number or email is already in use.' };
    return { error: res.error.message };
  }
  if (!res.count) return { error: 'Only HR can add or edit workers.' };
  revalidatePath('/', 'layout');
  return { ok: true, message: id ? 'Worker updated.' : `Worker added. ${row.full_name} can now sign up with ${row.email}.` };
}

export async function updateLeaveType(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { error, count } = await supabase.from('leave_types').update({
    default_days: n(fd, 'default_days'),
    min_notice_days: n(fd, 'min_notice_days'),
    is_active: fd.get('is_active') === 'on',
  }, { count: 'exact' }).eq('code', s(fd, 'code'));
  if (error) return { error: error.message };
  if (!count) return { error: 'Only HR can change leave policy.' };
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Saved. New defaults apply to entitlements generated from now on.' };
}

export async function addHoliday(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.from('public_holidays').insert({ holiday_date: s(fd, 'holiday_date'), name: s(fd, 'name') });
  if (error) return { error: error.code === '23505' ? 'That date is already a public holiday.' : error.message };
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Holiday added.' };
}

export async function deleteHoliday(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { error, count } = await supabase.from('public_holidays').delete({ count: 'exact' }).eq('holiday_date', s(fd, 'holiday_date'));
  if (error) return { error: error.message };
  if (!count) return { error: 'Only HR can remove holidays.' };
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function updateCategory(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const limit = s(fd, 'per_line_limit');
  const { error, count } = await supabase.from('claim_categories').update({
    per_line_limit: limit === '' ? null : Number(limit),
    requires_receipt: fd.get('requires_receipt') === 'on',
    is_active: fd.get('is_active') === 'on',
  }, { count: 'exact' }).eq('code', s(fd, 'code'));
  if (error) return { error: error.message };
  if (!count) return { error: 'Only HR or Finance can change claim policy.' };
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Saved.' };
}

export async function updateSetting(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { error, count } = await supabase.from('app_settings').update({ value: n(fd, 'value') }, { count: 'exact' }).eq('key', s(fd, 'key'));
  if (error) return { error: error.message };
  if (!count) return { error: 'Only HR can change settings.' };
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Saved.' };
}
