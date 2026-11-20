'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLinks({ items }: { items: { href: string; label: string; count?: number }[] }) {
  const path = usePathname();
  return (
    <nav className="mainnav" aria-label="Main">
      {items.map((i) => {
        const active = i.href === '/' ? path === '/' : path === i.href || path.startsWith(i.href + '/');
        return (
          <Link key={i.href} href={i.href} className={active ? 'active' : undefined}>
            {i.label}
            {!!i.count && <span className="nav-count">{i.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
