import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, PageHeader } from '@/components/ui';
import { WorkerForm } from '@/components/WorkerForm';
import { sgToday } from '@/lib/format';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Edit worker' };

export default async function EditWorker({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMe();
  if (!me.isHR) notFound();
  const { id } = await params;
  const supabase = await createClient();
  const [w, d, m] = await Promise.all([
    supabase.from('employees').select('*').eq('id', id).maybeSingle(),
    supabase.from('departments').select('id, name').order('name'),
    supabase.from('employees').select('id, full_name').eq('is_active', true).order('full_name'),
  ]);
  if (!w.data) notFound();
  return (
    <>
      <PageHeader back={{ href: '/people', label: 'People' }} title={w.data.full_name}
        subtitle={w.data.user_id ? 'Sign-in linked' : 'Not signed up yet'}
        actions={<Link className="btn btn-secondary" href={`/hr/entitlements/${id}?year=${sgToday().slice(0, 4)}`}>Entitlements</Link>} />
      <Card><WorkerForm worker={w.data} departments={d.data ?? []} managers={m.data ?? []} /></Card>
    </>
  );
}
