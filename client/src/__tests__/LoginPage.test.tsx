// client/src/__tests__/LoginPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from '../pages/LoginPage';

// Globe uses maplibre-gl / WebGL — not available in jsdom
vi.mock('../components/Globe', () => ({ default: () => <div data-testid="globe-mock" /> }));

// Mock the api module so no real HTTP calls are made
vi.mock('../lib/api', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  api: {
    post: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock auth store to start unauthenticated
vi.mock('../store/auth', () => ({
  useAuthStore: vi.fn(() => ({
    user: null,
    setSession: vi.fn(),
    booted: true,
  })),
}));

import { api } from '../lib/api';
import { useAuthStore } from '../store/auth';

function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuthStore as any).mockReturnValue({ user: null, setSession: vi.fn(), booted: true });
  });

  it('renders email and password inputs', () => {
    renderLogin();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows error message when login fails', async () => {
    (api.post as any).mockRejectedValueOnce({ message: 'Invalid credentials' });
    renderLogin();

    await userEvent.type(screen.getByLabelText(/email/i), 'bad@test.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrongpass');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
  });

  it('calls api.post with email and password on submit', async () => {
    const setSession = vi.fn();
    (useAuthStore as any).mockReturnValue({ user: null, setSession, booted: true });
    (api.post as any).mockResolvedValueOnce({ user: { id: '1', email: 'test@test.com', name: 'Test' }, accessToken: 'tok' });

    renderLogin();

    await userEvent.type(screen.getByLabelText(/email/i), 'test@test.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/auth/login', { email: 'test@test.com', password: 'password123' });
    });
    expect(setSession).toHaveBeenCalledWith(
      { id: '1', email: 'test@test.com', name: 'Test' },
      'tok'
    );
  });
});
