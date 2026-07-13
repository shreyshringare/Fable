import { describe, it, expect } from 'vitest';
import { settleUp, toUSD, formatMoney } from './currency';

describe('settleUp', () => {
  it('simple 2-person split: debtor pays creditor', () => {
    // Alice paid $100, Bob paid $0; split equally → Bob owes Alice $50
    const net = { alice: 50, bob: -50 };
    const txns = settleUp(net);

    expect(txns).toHaveLength(1);
    expect(txns[0]).toEqual({ from: 'bob', to: 'alice', amount: 50 });
  });

  it('3-person split uses minimal transactions', () => {
    // Alice: +60, Bob: -10, Carol: -50
    // Optimal: Bob→Alice $10, Carol→Alice $50 (2 transactions, not 3)
    const net = { alice: 60, bob: -10, carol: -50 };
    const txns = settleUp(net);

    expect(txns.length).toBeLessThanOrEqual(2);
    // All debts cleared
    const totals: Record<string, number> = { alice: 60, bob: -10, carol: -50 };
    for (const t of txns) {
      totals[t.from] += t.amount;
      totals[t.to] -= t.amount;
    }
    for (const balance of Object.values(totals)) {
      expect(Math.abs(balance)).toBeLessThan(0.01);
    }
  });

  it('already balanced → no transactions', () => {
    const net = { alice: 0, bob: 0 };
    expect(settleUp(net)).toHaveLength(0);
  });

  it('single creditor, multiple debtors', () => {
    // Alice paid everything, Bob and Carol each owe $30
    const net = { alice: 60, bob: -30, carol: -30 };
    const txns = settleUp(net);

    expect(txns).toHaveLength(2);
    const aliceReceives = txns.reduce((s, t) => (t.to === 'alice' ? s + t.amount : s), 0);
    expect(Math.abs(aliceReceives - 60)).toBeLessThan(0.01);
  });

  it('ignores dust (sub-cent rounding)', () => {
    // Floating-point residuals under $0.01 should not generate transactions
    const net = { alice: 0.005, bob: -0.005 };
    expect(settleUp(net)).toHaveLength(0);
  });
});

describe('toUSD', () => {
  it('converts EUR to USD', () => {
    expect(toUSD(100, 'EUR')).toBeCloseTo(109, 1);
  });

  it('USD stays USD', () => {
    expect(toUSD(42, 'USD')).toBe(42);
  });

  it('unknown currency defaults to 1:1', () => {
    expect(toUSD(50, 'XYZ')).toBe(50);
  });
});

describe('formatMoney', () => {
  it('formats USD with $ symbol', () => {
    expect(formatMoney(1234.5)).toContain('1,234.50');
  });
});
