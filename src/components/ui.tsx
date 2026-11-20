import Link from 'next/link';
import type { ReactNode } from 'react';
import { CLAIM_STATUS, LEAVE_STATUS, initials } from '@/lib/format';

export function Badge({ tone = 'grey', children }: { tone?: string; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function LeaveStatus({ status }: { status: string }) {
  const s = LEAVE_STATUS[status] ?? { label: status, tone: 'grey' };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function ClaimStatus({ status }: { status: string }) {
  const s = CLAIM_STATUS[status] ?? { label: status, tone: 'grey' };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function Card({ title, action, children, className = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="card-head">
          {title && <h2>{title}</h2>}
          {action && <div className="card-action">{action}</div>}
        </header>
      )}
      <div className="card-body">{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="page-head">
      <div>
        {back && <Link href={back.href} className="back-link">‹ {back.label}</Link>}
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${h} 55% 42%)` }}>
      {initials(name)}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: string }) {
  return (
    <div className={`stat ${tone ? 'stat-' + tone : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function Tabs({ items, current }: { items: { href: string; label: string; key: string; count?: number }[]; current: string }) {
  return (
    <nav className="tabs">
      {items.map((t) => (
        <Link key={t.key} href={t.href} className={t.key === current ? 'tab active' : 'tab'}>
          {t.label}
          {t.count !== undefined && <span className="tab-count">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
