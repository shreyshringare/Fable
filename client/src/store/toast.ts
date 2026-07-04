import { create } from 'zustand';

export interface Toast {
  id: number;
  message: string;
  kind: 'error' | 'success' | 'info';
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, kind?: Toast['kind']) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (message, kind = 'error') => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, message, kind }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = (message: string, kind: Toast['kind'] = 'error') =>
  useToastStore.getState().push(message, kind);
