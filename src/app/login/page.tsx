import type { Metadata } from 'next';
import { BrandMark } from '@/components/icons';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Sign in' };

const DEMO = [
  { email: 'daniel.lim@example.com', who: 'Daniel Lim', role: 'Employee (Operations)' },
  { email: 'priya.nair@example.com', who: 'Priya Nair', role: 'Employee, Jul 2026 joiner (Sales)' },
  { email: 'meiling.wong@example.com', who: 'Wong Mei Ling', role: 'Department Head (Operations)' },
  { email: 'rajesh.kumar@example.com', who: 'Rajesh Kumar', role: 'Department Head (Sales)' },
  { email: 'grace.tan@example.com', who: 'Grace Tan', role: 'Managing Director' },
  { email: 'sarah.chen@example.com', who: 'Sarah Chen', role: 'HR Manager' },
  { email: 'nurul.huda@example.com', who: 'Nurul Huda', role: 'Office Manager' },
  { email: 'kevin.ong@example.com', who: 'Kevin Ong', role: 'Finance Manager' },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const showDemo = process.env.NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS !== 'false';
  return (
    <main className="login-wrap">
      <div className="login-panel">
        <div className="login-brand">
          <BrandMark size={40} />
          <div>
            <strong>Leave &amp; Claims Portal</strong>
            <span>Self-service HR for every worker</span>
          </div>
        </div>
        <LoginForm next={next} />
      </div>
      {showDemo && (
        <aside className="login-demo">
          <h2>Demo accounts</h2>
          <p>
            Password for all: <code>Workday#Demo2026</code>
          </p>
          <ul>
            {DEMO.map((d) => (
              <li key={d.email}>
                <strong>{d.who}</strong>
                <span>{d.role}</span>
                <code>{d.email}</code>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </main>
  );
}
