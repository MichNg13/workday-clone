import type { Metadata } from 'next';
import Link from 'next/link';
import { Avatar, Badge, Empty, PageHeader } from '@/components/ui';
import { ROLE_LABEL } from '@/lib/format';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'People' };

function PersonWrap({ href, className, children }: { href?: string; className: string; children: React.ReactNode }) {
  return href ? <Link href={href} className={className}>{children}</Link> : <div className={className}>{children}</div>;
}

export default async function People({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requireMe();
  const { q = '' } = await searchParams;
  const supabase = await createClient();
  let query = supabase.from('employees').select('*, department:department_id(name), manager:manager_id(full_name)').order('full_name');
  if (!me.isHR) query = query.eq('is_active', true);
  const term = q.trim().replace(/[%,()]/g, ' ');
  if (term) query = query.or(`full_name.ilike.%${term}%,job_title.ilike.%${term}%,email.ilike.%${term}%,employee_no.ilike.%${term}%`);
  const { data } = await query;

  return (
    <>
      <PageHeader title="People" subtitle="Worker directory and reporting lines."
        actions={me.isHR ? <Link href="/people/new" className="btn btn-primary">Add worker</Link> : undefined} />
      <form className="inline-filters spaced">
        <input name="q" defaultValue={q} placeholder="Search by name, title, email or employee no." className="grow" />
        <button className="btn btn-secondary">Search</button>
      </form>
      {(data ?? []).length === 0 ? <Empty>No one matches “{q}”.</Empty> : (
        <div className="people-grid">
          {data!.map((p) => (
            <PersonWrap key={p.id} href={me.isHR ? `/people/${p.id}` : undefined} className={`person-card ${p.is_active ? '' : 'inactive'}`}>
              <Avatar name={p.full_name} size={48} />
              <div>
                <strong>{p.full_name}</strong>
                <span>{p.job_title}</span>
                <span className="muted small">{p.department?.name ?? '—'}{p.manager?.full_name ? ` · reports to ${p.manager.full_name}` : ''}</span>
                <span className="muted small">{p.email}</span>
                <span>
                  {p.role !== 'employee' && <Badge tone="blue">{ROLE_LABEL[p.role]}</Badge>}{' '}
                  {!p.is_active && <Badge>Inactive</Badge>}{' '}
                  {me.isHR && !p.user_id && <Badge tone="amber">No sign-in yet</Badge>}
                </span>
              </div>
            </PersonWrap>
          ))}
        </div>
      )}
    </>
  );
}
