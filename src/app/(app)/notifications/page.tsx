import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, Empty, PageHeader } from '@/components/ui';
import { markAllRead } from '@/app/actions/workflow';
import { timeAgo } from '@/lib/format';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Notifications' };

export default async function Notifications() {
  const me = await requireMe();
  const supabase = await createClient();
  const { data } = await supabase.from('notifications').select('*').eq('recipient_id', me.id).order('created_at', { ascending: false }).limit(100);
  const unread = (data ?? []).filter((n) => !n.read_at).length;
  return (
    <>
      <PageHeader title="Notifications" subtitle={`${unread} unread`}
        actions={unread > 0 ? <form action={markAllRead}><button className="btn btn-secondary">Mark all as read</button></form> : undefined} />
      <Card>
        {(data ?? []).length === 0 ? <Empty>No notifications yet.</Empty> : (
          <ul className="notif-list">
            {data!.map((n) => (
              <li key={n.id} className={n.read_at ? '' : 'unread'}>
                <Link href={n.link ?? '#'}>
                  <span className={`notif-kind k-${n.kind}`} />
                  <span className="grow"><strong>{n.title}</strong>{n.body && <span className="muted">{n.body}</span>}</span>
                  <span className="muted small">{timeAgo(n.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
