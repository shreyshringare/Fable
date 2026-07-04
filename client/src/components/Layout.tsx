import { Link, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { socket } from '../lib/ws';
import { useAuthStore } from '../store/auth';
import Avatar from './Avatar';
import DarkModeToggle from './DarkModeToggle';

export default function Layout() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  async function logout() {
    try {
      await api.post('/auth/logout');
    } catch {
      /* cookie may already be gone */
    }
    socket.disconnect();
    useAuthStore.getState().clear();
    navigate('/login');
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/80 backdrop-blur dark:bg-gray-900/80 dark:border-gray-700">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 text-lg font-extrabold text-indigo-600 dark:text-indigo-400">
            <span className="text-xl">🧭</span> Fable
          </Link>
          <div className="flex items-center gap-3">
            <DarkModeToggle />
            {user && (
              <>
                <Link to="/profile" className="flex items-center gap-2">
                  <Avatar name={user.name} url={user.avatar_url} size={32} />
                  <span className="hidden sm:block text-sm font-medium">{user.name}</span>
                </Link>
                <button onClick={logout} className="btn-secondary !px-3 !py-1.5 text-xs">
                  Log out
                </button>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
