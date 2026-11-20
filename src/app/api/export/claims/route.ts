import type { NextRequest } from 'next/server';
import { csvResponse } from '@/lib/csv';
import { getMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const me = await getMe();
  if (!me?.isFinance && !me?.isDirector) return new Response('Forbidden', { status: 403 });
  const sp = req.nextUrl.searchParams;
  const status = sp.get('status') ?? 'approved';
  const period = sp.get('period');
  const supabase = await createClient();
  let q = supabase.from('claims')
    .select('reference, status, title, total_amount, currency, submitted_at, decided_at, paid_date, payment_reference, payroll_period, employee:employee_id(employee_no, full_name, department:department_id(name)), decider:decided_by(full_name), lines:claim_lines(line_no, expense_date, category_code, description, amount, receipt_no, category:category_code(gl_code))')
    .eq('status', status).order('reference');
  if (period && /^\d{4}-\d{2}$/.test(period)) q = q.eq('payroll_period', period);
  const { data, error } = await q;
  if (error) return new Response(error.message, { status: 500 });
  const rows: unknown[][] = [];
  (data ?? []).forEach((c: any) => {
    (c.lines ?? []).sort((a: any, b: any) => a.line_no - b.line_no).forEach((l: any) => {
      rows.push([
        c.reference, c.employee?.employee_no, c.employee?.full_name, c.employee?.department?.name, c.status, c.title,
        l.line_no, l.expense_date, l.category_code, l.category?.gl_code, l.description, l.receipt_no, l.amount, c.total_amount, c.currency,
        c.decider?.full_name, c.decided_at, c.payroll_period, c.paid_date, c.payment_reference,
      ]);
    });
  });
  return csvResponse(`claims-${status}${period ? '-' + period : ''}.csv`, [
    'Claim Ref', 'Employee No', 'Name', 'Department', 'Status', 'Title', 'Line', 'Expense Date', 'Category', 'GL Code',
    'Description', 'Receipt No', 'Line Amount', 'Claim Total', 'Currency', 'Approved By', 'Approved At', 'Payroll', 'Paid Date', 'Payment Ref',
  ], rows);
}
