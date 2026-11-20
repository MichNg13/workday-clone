import type { Metadata } from 'next';
import { BrandMark } from '@/components/icons';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
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
    </main>
  );
}
