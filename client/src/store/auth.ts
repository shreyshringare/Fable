import { create } from 'zustand';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  booted: boolean;
  setSession: (user: User, token: string) => void;
  setUser: (user: User) => void;
  setBooted: () => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  booted: false,
  setSession: (user, accessToken) => set({ user, accessToken }),
  setUser: (user) => set({ user }),
  setBooted: () => set({ booted: true }),
  clear: () => set({ user: null, accessToken: null }),
}));
