import { cache } from 'react';
import { createClient } from './supabase/server';
import type { Me } from './session';

export const getCounts = cache(async (me: Me) => {
  const supabase = await createClient();
  const mine = `approver_id.eq.${me.id},escalated_to_id.eq.${me.id}`;
  const [l, c, n, f] = await Promise.all([
    supabase.from('leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending').or(mine).neq('employee_id', me.id),
    supabase.from('claims').select('id', { count: 'exact', head: true }).eq('status', 'pending').or(mine).neq('employee_id', me.id),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('recipient_id', me.id).is('read_at', null),
    me.isFinance
      ? supabase.from('claims').select('id', { count: 'exact', head: true }).eq('status', 'approved')
      : Promise.resolve({ count: 0 }),
  ]);
  return {
    inbox: (l.count ?? 0) + (c.count ?? 0),
    leaveInbox: l.count ?? 0,
    claimInbox: c.count ?? 0,
    unread: n.count ?? 0,
    toPay: f.count ?? 0,
  };
});
