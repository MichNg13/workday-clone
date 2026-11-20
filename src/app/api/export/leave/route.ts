import type { NextRequest } from 'next/server';
import { csvResponse } from '@/lib/csv';
import { monthBounds, sgToday } from '@/lib/format';
import { getMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const me = await getMe();
  if (!me?.canSeeHR) return new Response('Forbidden', { status: 403 });
  const sp = req.nextUrl.searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.get('month') ?? '') ? sp.get('month')! : sgToday().slice(0, 7);
  const { from, to } = monthBounds(month);
  const supabase = await createClient();
  let q = supabase.from('leave_requests')
    .select('*, employee:employee_id(employee_no, full_name, department_id, department:department_id(name)), type:leave_type_code(name, is_paid), approver:approver_id(full_name), decider:decided_by(full_name)')
    .lte('start_date', to).gte('end_date', from).order('start_date');
  if (sp.get('status')) q = q.eq('status', sp.get('status')!);
  if (sp.get('type')) q = q.eq('leave_type_code', sp.get('type')!);
  const { data, error } = await q;
  if (error) return new Response(error.message, { status: 500 });
  const dept = sp.get('dept');
  const rows = (data ?? []).filter((r) => !dept || r.employee?.department_id === dept).map((r) => [
    r.reference, r.employee?.employee_no, r.employee?.full_name, r.employee?.department?.name, r.leave_type_code, r.type?.name,
    r.type?.is_paid ? 'Paid' : 'No-pay', r.start_date, r.end_date, r.day_part, r.days, r.document_ref, r.status,
    r.approver?.full_name, r.decider?.full_name, r.decided_at, r.decision_remark, r.submitted_at,
  ]);
  return csvResponse(`leave-${month}.csv`, [
    'Reference', 'Employee No', 'Name', 'Department', 'Type Code', 'Type', 'Pay', 'Start', 'End', 'Day Part', 'Days',
    'MC/Document No', 'Status', 'Approver', 'Decided By', 'Decided At', 'Remark', 'Submitted At',
  ], rows);
}
