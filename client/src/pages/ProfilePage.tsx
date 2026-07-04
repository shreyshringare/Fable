import { FormEvent, useState } from 'react';
import { api, uploadFile } from '../lib/api';
import { useAuthStore } from '../store/auth';
import Avatar from '../components/Avatar';
import type { User } from '../types';

export default function ProfilePage() {
  const { user, setUser } = useAuthStore();
  const [name, setName] = useState(user?.name ?? '');
  const [avatar, setAvatar] = useState<File | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      let avatar_url: string | undefined;
      if (avatar) avatar_url = (await uploadFile('avatars', avatar)).url;
      const updated = await api.patch<User>('/users/me', {
        name,
        ...(avatar_url ? { avatar_url } : {}),
      });
      setUser(updated);
      setSaved(true);
      setAvatar(null);
    } catch (err: any) {
      setError(err.message || 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-6 text-2xl font-extrabold">Your profile</h1>
      <div className="card p-6">
        <div className="mb-6 flex items-center gap-4">
          <Avatar name={user.name} url={user.avatar_url} size={64} />
          <div>
            <p className="font-bold">{user.name}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Display name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="label">Avatar</label>
            <input
              type="file"
              accept="image/*"
              className="input"
              onChange={(e) => setAvatar(e.target.files?.[0] ?? null)}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {saved && <p className="text-sm text-green-600">Profile updated.</p>}
          <button className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </div>
    </div>
  );
}
