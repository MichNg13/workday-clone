import Link from 'next/link';
import { BrandMark, IconBell, IconInbox, IconLogout, IconUser } from '@/components/icons';
import { NavLinks } from '@/components/NavLinks';
import { Avatar } from '@/components/ui';
import { getCounts } from '@/lib/counts';
import { ROLE_LABEL } from '@/lib/format';
import { requireMe } from '@/lib/session';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMe();
  const counts = await getCounts(me);

  const nav: { href: string; label: string; count?: number }[] = [
    { href: '/', label: 'Home' },
    { href: '/inbox', label: 'Inbox', count: counts.inbox },
    { href: '/time-off', label: 'Time Off' },
    { href: '/expenses', label: 'Expenses' },
  ];
  if (me.isManager || me.canSeeHR) nav.push({ href: '/team', label: 'My Team' });
  if (me.canSeeHR) nav.push({ href: '/hr', label: 'HR' });
  if (me.isFinance || me.isDirector) nav.push({ href: '/finance', label: 'Finance', count: me.isFinance ? counts.toPay : undefined });
  nav.push({ href: '/people', label: 'People' });

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand" aria-label="Home">
            <BrandMark />
            <span>Leave &amp; Claims</span>
          </Link>
          <form action="/people" className="search">
            <input name="q" placeholder="Search people" aria-label="Search people" />
          </form>
          <div className="topbar-icons">
            <Link href="/inbox" className="icon-btn" aria-label={`Inbox, ${counts.inbox} awaiting action`}>
              <IconInbox />
              {counts.inbox > 0 && <span className="dot">{counts.inbox}</span>}
            </Link>
            <Link href="/notifications" className="icon-btn" aria-label={`Notifications, ${counts.unread} unread`}>
              <IconBell />
              {counts.unread > 0 && <span className="dot">{counts.unread}</span>}
            </Link>
            <details className="usermenu">
              <summary aria-label="Account menu">
                <Avatar name={me.full_name} size={34} />
              </summary>
              <div className="usermenu-pop">
                <div className="usermenu-head">
                  <strong>{me.full_name}</strong>
                  <span>{me.job_title}</span>
                  <span className="muted">{ROLE_LABEL[me.role]}</span>
                </div>
                <Link href="/profile"><IconUser size={16} /> My profile</Link>
                <form action="/auth/signout" method="post">
                  <button type="submit"><IconLogout size={16} /> Sign out</button>
                </form>
              </div>
            </details>
          </div>
        </div>
        <NavLinks items={nav} />
      </header>
      <main className="content">{children}</main>
      <footer className="footer">Leave &amp; Claims Portal · Times shown in Singapore time (SGT)</footer>
    </div>
  );
}
