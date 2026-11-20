import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Card, PageHeader } from '@/components/ui';
import { sgToday } from '@/lib/format';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { ClaimForm } from '../ClaimForm';

export const metadata: Metadata = { title: 'Create Expense Report' };

export default async function NewClaim({ searchParams }: { searchParams: Promise<{ resubmit?: string }> }) {
  const me = await requireMe();
  const { resubmit } = await searchParams;
  const supabase = await createClient();
  const { data: categories } = await supabase.from('claim_categories').select('*').eq('is_active', true).order('sort_order');

  let existing: any;
  if (resubmit) {
    const { data } = await supabase.from('claims').select('*, lines:claim_lines(*)').eq('id', resubmit).eq('employee_id', me.id).maybeSingle();
    if (!data || !['returned', 'rejected'].includes(data.status)) notFound();
    existing = {
      id: data.id, title: data.title, purpose: data.purpose,
      lines: (data.lines ?? []).sort((a: any, b: any) => a.line_no - b.line_no),
      remark: data.return_remark ?? data.decision_remark,
    };
  }

  return (
    <>
      <PageHeader back={{ href: '/expenses', label: 'Expenses' }} title={existing ? 'Fix & resubmit claim' : 'Create Expense Report'}
        subtitle="One line per receipt. Every receipt number is checked against your earlier claims." />
      <Card>
        <ClaimForm categories={categories ?? []} employeeId={me.id} today={sgToday()} existing={existing} />
      </Card>
    </>
  );
}
