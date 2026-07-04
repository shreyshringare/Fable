import { useEffect } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { api } from './lib/api';
import { socket } from './lib/ws';
import { useAuthStore } from './store/auth';
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import ProfilePage from './pages/ProfilePage';
import RegisterPage from './pages/RegisterPage';
import TripPage from './pages/TripPage';

function Protected() {
  const { user, booted } = useAuthStore();
  if (!booted) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="space-y-3 w-72">
          <div className="skeleton h-8 w-40 mx-auto" />
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-2/3 mx-auto" />
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export default function App() {
  const { user, setBooted } = useAuthStore();

  useEffect(() => {
    // Silent session restore via refresh cookie.
    api.refresh().finally(() => useAuthStore.getState().setBooted());
  }, [setBooted]);

  useEffect(() => {
    if (user) socket.connect();
    else socket.disconnect();
  }, [user]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<Protected />}>
        <Route element={<Layout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/trips/:tripId" element={<TripPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
