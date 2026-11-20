'use server';
import { revalidatePath } from 'next/cache';
import type { ActionState } from '@/components/ActionForm';
import { createClient } from '@/lib/supabase/server';

function str(fd: FormData, k: string) {
  const v = fd.get(k);
  return typeof v === 'string' ? v : '';
}

function refreshAll() {
  revalidatePath('/', 'layout');
}

export async function decideLeave(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const decision = str(fd, 'decision');
  const { data, error } = await supabase.rpc('decide_leave_request', {
    p_id: str(fd, 'id'), p_decision: decision, p_remark: str(fd, 'remark') || null,
  });
  if (error) return { error: error.message };
  refreshAll();
  return { ok: true, message: `${data.reference} ${data.status}. The employee has been notified.` };
}

export async function decideClaim(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('decide_claim', {
    p_id: str(fd, 'id'), p_decision: str(fd, 'decision'), p_remark: str(fd, 'remark') || null,
  });
  if (error) return { error: error.message };
  refreshAll();
  return { ok: true, message: data.status === 'approved' ? `${data.reference} approved and sent to Finance.` : `${data.reference} rejected.` };
}

export async function cancelLeave(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('cancel_leave_request', { p_id: str(fd, 'id'), p_remark: str(fd, 'remark') || null });
  if (error) return { error: error.message };
  refreshAll();
  return { ok: true, message: `${data.reference} cancelled. Your balance has been restored.` };
}

export async function cancelClaim(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('cancel_claim', { p_id: str(fd, 'id') });
  if (error) return { error: error.message };
  refreshAll();
  return { ok: true, message: `${data.reference} cancelled.` };
}

export async function payClaim(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('pay_claim', {
    p_id: str(fd, 'id'),
    p_payment_reference: str(fd, 'payment_reference'),
    p_paid_date: str(fd, 'paid_date') || null,
    p_payroll_period: str(fd, 'payroll_period') || null,
  });
  if (error) return { error: error.message };
  refreshAll();
  return { ok: true, message: `${data.reference} marked as paid.` };
}

export async function returnClaim(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('return_claim', { p_id: str(fd, 'id'), p_remark: str(fd, 'remark') });
  if (error) return { error: error.message };
  refreshAll();
  return { ok: true, message: `${data.reference} returned to the staff member.` };
}

export async function markAllRead(): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc('mark_notifications_read', { p_ids: null });
  refreshAll();
}

export async function updateProfile(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('update_my_profile', {
    p_preferred_name: str(fd, 'preferred_name'), p_phone: str(fd, 'phone'),
  });
  if (error) return { error: error.message };
  refreshAll();
  return { ok: true, message: 'Profile updated.' };
}
