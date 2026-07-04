import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth';
import { useTripStore } from '../store/trip';
import type { Member, Role } from '../types';
import Avatar from './Avatar';

export default function MembersPanel({ role }: { role: Role }) {
  const { members, presence, tripId } = useTripStore();
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor');
  const [error, setError] = useState('');
  const isOwner = role === 'owner';

  const online = new Set(presence.map((p) => p.id));

  async function invite(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const updated = await api.post<Member[]>(`/trips/${tripId}/members`, {
        email,
        role: inviteRole,
      });
      useTripStore.setState({ members: updated });
      setEmail('');
    } catch (err: any) {
      setError(err.message || 'Invite failed');
    }
  }

  async function changeRole(uid: string, newRole: string) {
    const updated = await api.patch<Member[]>(`/trips/${tripId}/members/${uid}`, { role: newRole });
    useTripStore.setState({ members: updated });
  }

  async function remove(uid: string) {
    const leaving = uid === user?.id;
    if (leaving && !window.confirm('Leave this trip?')) return;
    const updated = await api.delete<Member[]>(`/trips/${tripId}/members/${uid}`);
    if (leaving) {
      navigate('/');
      return;
    }
    useTripStore.setState({ members: updated });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h2 className="text-lg font-bold">Trip members</h2>

      <div className="card divide-y divide-gray-100 dark:divide-gray-700">
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-4 py-3">
            <div className="relative">
              <Avatar name={m.name} url={m.avatar_url} size={38} />
              {online.has(m.id) && (
                <span
                  className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 ring-2 ring-white dark:ring-gray-800"
                  title="Online now"
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {m.name}
                {m.id === user?.id && <span className="ml-1 text-xs text-gray-400">(you)</span>}
              </p>
              <p className="truncate text-xs text-gray-500 dark:text-gray-400">{m.email}</p>
            </div>
            {isOwner && m.role !== 'owner' ? (
              <select
                className="input !w-28 !py-1 text-xs"
                value={m.role}
                onChange={(e) => changeRole(m.id, e.target.value)}
              >
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
            ) : (
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium capitalize text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                {m.role}
              </span>
            )}
            {((isOwner && m.role !== 'owner') || (m.id === user?.id && m.role !== 'owner')) && (
              <button
                onClick={() => remove(m.id)}
                className="text-xs text-gray-400 hover:text-red-600"
              >
                {m.id === user?.id ? 'Leave' : 'Remove'}
              </button>
            )}
          </div>
        ))}
      </div>

      {isOwner && (
        <form onSubmit={invite} className="card flex flex-wrap items-end gap-2 p-4">
          <div className="min-w-52 flex-1">
            <label className="label">Invite by email</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="friend@example.com"
              required
            />
          </div>
          <div>
            <label className="label">Role</label>
            <select
              className="input"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'editor' | 'viewer')}
            >
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <button className="btn-primary">Invite</button>
          {error && <p className="w-full text-sm text-red-600">{error}</p>}
        </form>
      )}
      <p className="text-xs text-gray-400">
        Invitees need an existing Fable account with that email. Viewers can look but not touch.
      </p>
    </div>
  );
}
