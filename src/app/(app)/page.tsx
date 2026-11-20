import Link from 'next/link';
import {
  IconCalendar, IconChart, IconInbox, IconReceipt, IconSettings, IconUsers, IconWallet, IconChevron, IconClock,
} from '@/components/icons';
import { Avatar, Card, ClaimStatus, Empty, LeaveStatus } from '@/components/ui';
import { getCounts } from '@/lib/counts';
import { days, fmtDate, fmtRange, greeting, money, num, sgToday, timeAgo } from '@/lib/format';
import { firstName, requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export default async function Home() {
  const me = await requireMe();
  const counts = await getCounts(me);
  const supabase = await createClient();
  const today = sgToday();
  const year = Number(today.slice(0, 4));
  const mine = `approver_id.eq.${me.id},escalated_to_id.eq.${me.id}`;

  const [balances, myLeave, myClaims, holidays, pendingLeave, pendingClaims, out] = await Promise.all([
    supabase.from('leave_balances').select('*, type:leave_type_code(name, color, sort_order)').eq('employee_id', me.id).eq('year', year),
    supabase.from('leave_requests').select('*, type:leave_type_code(name)').eq('employee_id', me.id).order('submitted_at', { ascending: false }).limit(4),
    supabase.from('claims').select('*').eq('employee_id', me.id).order('submitted_at', { ascending: false }).limit(4),
    supabase.from('public_holidays').select('*').gte('holiday_date', today).order('holiday_date').limit(4),
    supabase.from('leave_requests').select('id, reference, submitted_at, days, start_date, end_date, day_part, employee:employee_id(full_name), type:leave_type_code(name)').eq('status', 'pending').or(mine).neq('employee_id', me.id).order('submitted_at').limit(5),
    supabase.from('claims').select('id, reference, submitted_at, total_amount, title, employee:employee_id(full_name)').eq('status', 'pending').or(mine).neq('employee_id', me.id).order('submitted_at').limit(5),
    supabase.rpc('team_absences', { p_from: today, p_to: today }),
  ]);

  const tasks = [
    ...(pendingLeave.data ?? []).map((r: any) => ({
      key: 'l' + r.id, when: r.submitted_at,
      title: `Time off request: ${r.employee?.full_name}`,
      sub: `${r.reference} · ${r.type?.name} · ${fmtRange(r.start_date, r.end_date, r.day_part)} · ${days(r.days)}`,
    })),
    ...(pendingClaims.data ?? []).map((c: any) => ({
      key: 'c' + c.id, when: c.submitted_at,
      title: `Expense report: ${c.employee?.full_name}`,
      sub: `${c.reference} · ${c.title} · ${money(c.total_amount)}`,
    })),
  ].sort((a, b) => a.when.localeCompare(b.when));

  const bal = (balances.data ?? []).sort((a, b) => (a.type?.sort_order ?? 0) - (b.type?.sort_order ?? 0));
  const whoIsOut = (out.data ?? []).filter((r: any) => r.status === 'approved');

  const apps = [
    { href: '/time-off', label: 'Time Off', icon: <IconCalendar size={26} />, desc: 'Request leave, see balances' },
    { href: '/expenses/new', label: 'Expenses', icon: <IconReceipt size={26} />, desc: 'Create an expense report' },
    { href: '/inbox', label: 'Inbox', icon: <IconInbox size={26} />, desc: `${counts.inbox} awaiting your action` },
  ];
  if (me.isManager || me.canSeeHR) apps.push({ href: '/team', label: 'My Team', icon: <IconUsers size={26} />, desc: 'Team calendar & balances' });
  if (me.canSeeHR) apps.push({ href: '/hr', label: 'Leave Record', icon: <IconSettings size={26} />, desc: 'Master Leave Record & tracker' });
  if (me.canSeeHR || me.isFinance) apps.push({ href: '/hr/reports', label: 'Reports', icon: <IconChart size={26} />, desc: 'Monthly summary & KPIs' });
  if (me.isFinance) apps.push({ href: '/finance', label: 'Payments', icon: <IconWallet size={26} />, desc: `${counts.toPay} claims ready to pay` });

  return (
    <div className="home">
      <section className="hero">
        <div>
          <p className="hero-date">{fmtDate(today, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          <h1>{greeting()}, {firstName(me)}</h1>
          <p className="hero-sub">{me.job_title}{me.department_name ? ` · ${me.department_name}` : ''}</p>
        </div>
        <div className="hero-actions">
          <Link href="/time-off#request" className="btn btn-light">Request Time Off</Link>
          <Link href="/expenses/new" className="btn btn-light">Create Expense Report</Link>
        </div>
      </section>

      <div className="home-grid">
        <div className="col-main">
          <Card title={<>Awaiting Your Action {counts.inbox > 0 && <span className="pill">{counts.inbox}</span>}</>}
            action={<Link href="/inbox" className="link">Go to Inbox</Link>}>
            {tasks.length === 0 ? (
              <Empty>You&apos;re all caught up. Nothing needs your approval.</Empty>
            ) : (
              <ul className="task-list">
                {tasks.map((t) => (
                  <li key={t.key}>
                    <Link href="/inbox">
                      <span className="task-icon"><IconClock size={18} /></span>
                      <span className="task-text"><strong>{t.title}</strong><span>{t.sub}</span></span>
                      <span className="task-when">{timeAgo(t.when)}</span>
                      <IconChevron size={16} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {me.isFinance && counts.toPay > 0 && (
              <Link href="/finance" className="task-banner">{counts.toPay} approved claim(s) are waiting for payment →</Link>
            )}
          </Card>

          <Card title="Your Top Apps">
            <div className="app-tiles">
              {apps.map((a) => (
                <Link key={a.href} href={a.href} className="app-tile">
                  <span className="app-icon">{a.icon}</span>
                  <strong>{a.label}</strong>
                  <span>{a.desc}</span>
                </Link>
              ))}
            </div>
          </Card>

          <div className="two-col">
            <Card title="My Time Off" action={<Link href="/time-off" className="link">View all</Link>}>
              {(myLeave.data ?? []).length === 0 ? <Empty>No leave requests yet.</Empty> : (
                <ul className="mini-list">
                  {myLeave.data!.map((r) => (
                    <li key={r.id}>
                      <Link href={`/time-off/${r.id}`}>
                        <span><strong>{r.type?.name}</strong><span className="muted">{fmtRange(r.start_date, r.end_date, r.day_part)} · {days(r.days)}</span></span>
                        <LeaveStatus status={r.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="My Expense Reports" action={<Link href="/expenses" className="link">View all</Link>}>
              {(myClaims.data ?? []).length === 0 ? <Empty>No expense reports yet.</Empty> : (
                <ul className="mini-list">
                  {myClaims.data!.map((c) => (
                    <li key={c.id}>
                      <Link href={`/expenses/${c.id}`}>
                        <span><strong>{c.title}</strong><span className="muted">{c.reference} · {money(c.total_amount)}</span></span>
                        <ClaimStatus status={c.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>

        <aside className="col-side">
          <Card title={`Leave Balances ${year}`} action={<Link href="/time-off" className="link">Details</Link>}>
            {bal.length === 0 ? <Empty>No entitlements set up yet.</Empty> : (
              <ul className="balance-list">
                {bal.map((b) => {
                  const pct = Number(b.entitled) > 0 ? Math.max(0, Math.min(100, (Number(b.available) / Number(b.entitled)) * 100)) : 0;
                  return (
                    <li key={b.leave_type_code}>
                      <div className="balance-row">
                        <span>{b.type?.name}</span>
                        <strong>{num(b.available)} <span className="muted">/ {num(b.entitled)}</span></strong>
                      </div>
                      <div className="meter"><span style={{ width: `${pct}%`, background: b.type?.color }} /></div>
                      {Number(b.pending) > 0 && <div className="muted small">{num(b.pending)} pending approval</div>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Who's Out Today">
            {whoIsOut.length === 0 ? <Empty>Everyone in your team is in today.</Empty> : (
              <ul className="people-list">
                {whoIsOut.map((r: any) => (
                  <li key={r.request_id}>
                    <Avatar name={r.full_name} size={30} />
                    <span><strong>{r.full_name}</strong><span className="muted">{r.leave_type_name} · back after {fmtDate(r.end_date, { year: undefined })}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Upcoming Public Holidays">
            <ul className="mini-list plain">
              {(holidays.data ?? []).map((h) => (
                <li key={h.holiday_date}>
                  <span><strong>{h.name}</strong></span>
                  <span className="muted">{fmtDate(h.holiday_date, { weekday: 'short' })}</span>
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
