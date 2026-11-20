'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const supabase = createClient();
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        const dest = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
        router.replace(dest);
        router.refresh();
        return;
      }
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/login` },
        });
        if (error) {
          if (/database error/i.test(error.message)) {
            throw new Error('This email is not registered as a worker. Ask HR to add you first, then sign up with your work email.');
          }
          throw error;
        }
        if (data.session) {
          router.replace('/');
          router.refresh();
          return;
        }
        setInfo('Check your inbox to confirm your email, then sign in.');
      }
      if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/login`,
        });
        if (error) throw error;
        setInfo('If that email is registered, a reset link is on its way.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="login-form">
      <h1>{mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create your account' : 'Reset password'}</h1>
      {mode === 'signup' && <p className="muted">Use the work email HR registered for you.</p>}
      <label className="field">
        <span>Work email</span>
        <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      {mode !== 'reset' && (
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
      )}
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {info && <div className="alert alert-success" role="status">{info}</div>}
      <button className="btn btn-primary btn-block" disabled={busy}>
        {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Sign up' : 'Send reset link'}
      </button>
      <div className="login-links">
        {mode !== 'signin' && <button type="button" className="link" onClick={() => setMode('signin')}>Back to sign in</button>}
        {mode === 'signin' && <button type="button" className="link" onClick={() => setMode('signup')}>First time? Create account</button>}
        {mode === 'signin' && <button type="button" className="link" onClick={() => setMode('reset')}>Forgot password</button>}
      </div>
    </form>
  );
}
