import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth';
import type { User } from '../types';
import Globe from '../components/Globe';

export default function LoginPage() {
  const { user, setSession } = useAuthStore();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.post<{ user: User; accessToken: string }>('/auth/login', {
        email,
        password,
      });
      setSession(res.user, res.accessToken);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="grid w-full max-w-4xl items-center gap-8 lg:grid-cols-2">
        <div className="mx-auto w-72 max-w-full sm:w-80 lg:w-full lg:max-w-md">
          <Globe />
          <div className="-mt-4 text-center lg:mt-0">
            <h1 className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400">Fable</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Plan adventures together, in real time.
            </p>
          </div>
        </div>
        <div className="card w-full max-w-md p-8 lg:justify-self-start">
          <h2 className="mb-4 text-lg font-bold">Welcome back</h2>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
          <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
            No account?{' '}
            <Link to="/register" className="font-medium text-indigo-600 dark:text-indigo-400">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
