// client/src/__tests__/BudgetTab.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import BudgetTab from '../components/BudgetTab';

// Mock recharts — uses ResizeObserver + SVG which fail in jsdom
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <>{children}</>,
  PieChart: ({ children }: any) => <div>{children}</div>,
  Pie: () => null,
  Cell: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

// Mock Modal — uses portals which can be tricky in jsdom
vi.mock('../components/Modal', () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));

// Mock the api module so no real HTTP calls are made
vi.mock('../lib/api', () => ({
  api: {
    post: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  },
}));

// Mock useTripStore — Zustand store won't have data in test env
vi.mock('../store/trip', () => ({
  useTripStore: vi.fn(),
}));

import { useTripStore } from '../store/trip';
import type { BudgetItem, Member } from '../types';

const defaultMembers: Member[] = [];

function makeStore(budget: BudgetItem[], members: Member[] = defaultMembers) {
  (useTripStore as any).mockReturnValue({
    budget,
    members,
    tripId: 'trip-1',
  });
}

const baseBudgetItem: BudgetItem = {
  id: 'b1',
  trip_id: 'trip-1',
  category: 'food',
  label: 'Ramen night',
  amount: 60,
  currency: 'USD',
  paid_by_user_id: null,
  split_among: [],
  created_at: '2024-01-01T00:00:00Z',
};

describe('BudgetTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows empty state when no expenses', () => {
    makeStore([]);
    render(<BudgetTab canEdit={false} />);
    expect(screen.getByText(/No expenses yet\./i)).toBeInTheDocument();
  });

  it('shows total when expenses present', () => {
    makeStore([{ ...baseBudgetItem, amount: 60, currency: 'USD' }]);
    render(<BudgetTab canEdit={false} />);
    // $60.00 appears in the Total header and in the expense list — getAllByText confirms at least one
    expect(screen.getAllByText('$60.00').length).toBeGreaterThan(0);
  });

  it('renders expense label in list', () => {
    makeStore([{ ...baseBudgetItem, label: 'Ramen night' }]);
    render(<BudgetTab canEdit={false} />);
    expect(screen.getByText('Ramen night')).toBeInTheDocument();
  });

  it('shows "Add expense" button when canEdit=true', () => {
    makeStore([]);
    render(<BudgetTab canEdit={true} />);
    expect(screen.getByRole('button', { name: /add expense/i })).toBeInTheDocument();
  });

  it('hides "Add expense" button when canEdit=false', () => {
    makeStore([]);
    render(<BudgetTab canEdit={false} />);
    expect(screen.queryByRole('button', { name: /add expense/i })).toBeNull();
  });

  it('shows "All square" when no debts', () => {
    makeStore([]);
    render(<BudgetTab canEdit={false} />);
    expect(screen.getByText(/All square/i)).toBeInTheDocument();
  });
});
