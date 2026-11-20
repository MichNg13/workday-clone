import type { NextRequest } from 'next/server';
import { csvResponse } from '@/lib/csv';
import { sgToday } from '@/lib/format';
import { getMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const me = await getMe();
  if (!me?.canSeeHR) return new Response('Forbidden', { status: 403 });
  const year = Number(req.nextUrl.searchParams.get('year')) || Number(sgToday().slice(0, 4));
  const supabase = await createClient();
  const { data, error } = await supabase.from('leave_balances')
    .select('*, employee:employee_id(employee_no, full_name, department:department_id(name)), type:leave_type_code(name)')
    .eq('year', year);
  if (error) return new Response(error.message, { status: 500 });
  const rows = (data ?? [])
    .sort((a, b) => `${a.employee?.full_name}${a.leave_type_code}`.localeCompare(`${b.employee?.full_name}${b.leave_type_code}`))
    .map((b) => [year, b.employee?.employee_no, b.employee?.full_name, b.employee?.department?.name, b.leave_type_code, b.type?.name,
      b.entitled_days, b.carried_forward, b.adjustment, b.entitled, b.taken, b.pending, b.linked, b.available, b.note]);
  return csvResponse(`master-leave-record-${year}.csv`, [
    'Year', 'Employee No', 'Name', 'Department', 'Type Code', 'Type', 'Contract Entitlement', 'Carried Forward', 'Adjustment',
    'Total Entitled', 'Taken', 'Pending', 'Used by Linked Type', 'Available', 'Note',
  ], rows);
}
