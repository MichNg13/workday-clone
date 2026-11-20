import { redirect } from 'next/navigation';
import { getMe, getUser } from '@/lib/session';

export default async function NotLinked() {
  const user = await getUser();
  if (!user) redirect('/login');
  if (await getMe()) redirect('/');
  return (
    <main className="login-wrap">
      <div className="login-panel">
        <h1>Account not linked</h1>
        <p>
          You are signed in as <strong>{user.email}</strong>, but there is no active worker record for this email.
          Ask HR to add you (People › Add worker) using exactly this email address, then refresh.
        </p>
        <form action="/auth/signout" method="post">
          <button className="btn btn-secondary">Sign out</button>
        </form>
      </div>
    </main>
  );
}
