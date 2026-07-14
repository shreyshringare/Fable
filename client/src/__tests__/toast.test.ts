// client/src/__tests__/toast.test.ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useToastStore } from '../store/toast';

describe('toast store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('push adds a toast', () => {
    useToastStore.getState().push('Something failed');
    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0].message).toBe('Something failed');
    expect(useToastStore.getState().toasts[0].kind).toBe('error');
  });

  it('push with kind=success sets kind', () => {
    useToastStore.getState().push('Saved!', 'success');
    expect(useToastStore.getState().toasts[0].kind).toBe('success');
  });

  it('dismiss removes by id', () => {
    useToastStore.getState().push('First');
    const id = useToastStore.getState().toasts[0].id;
    useToastStore.getState().dismiss(id);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('auto-dismisses after 4500ms', () => {
    useToastStore.getState().push('Temporary');
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(4500);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('keeps at most last 4 toasts', () => {
    for (let i = 0; i < 5; i++) useToastStore.getState().push(`msg ${i}`);
    expect(useToastStore.getState().toasts.length).toBeLessThanOrEqual(4);
  });
});
