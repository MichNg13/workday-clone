import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Card, PageHeader } from '@/components/ui';
import { WorkerForm } from '@/components/WorkerForm';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Add worker' };

export default async function NewWorker() {
  const me = await requireMe();
  if (!me.isHR) notFound();
  const supabase = await createClient();
  const [d, m] = await Promise.all([
    supabase.from('departments').select('id, name').order('name'),
    supabase.from('employees').select('id, full_name').eq('is_active', true).order('full_name'),
  ]);
  return (
    <>
      <PageHeader back={{ href: '/people', label: 'People' }} title="Add worker"
        subtitle="The worker can then sign up with this email. Entitlements for this year are created automatically (pro-rated from the hire date)." />
      <Card><WorkerForm departments={d.data ?? []} managers={m.data ?? []} /></Card>
    </>
  );
}
