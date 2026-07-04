/** Hardcoded conversion rates to USD (base). Good enough for trip budgeting. */
export const RATES_TO_USD: Record<string, number> = {
  USD: 1,
  EUR: 1.09,
  GBP: 1.28,
  JPY: 0.0067,
  CHF: 1.13,
  CAD: 0.73,
  AUD: 0.66,
  INR: 0.012,
  CNY: 0.14,
  THB: 0.028,
  VND: 0.00004,
  MXN: 0.055,
  BRL: 0.18,
  ZAR: 0.055,
  SGD: 0.75,
  KRW: 0.00073,
  IDR: 0.000063,
  TRY: 0.03,
  AED: 0.27,
  NZD: 0.6,
};

export const CURRENCIES = Object.keys(RATES_TO_USD);

export function toUSD(amount: number, currency: string): number {
  return amount * (RATES_TO_USD[currency.toUpperCase()] ?? 1);
}

export function formatMoney(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Minimal set of transactions settling everyone's debts.
 * net > 0 → is owed money; net < 0 → owes money.
 */
export function settleUp(net: Record<string, number>): { from: string; to: string; amount: number }[] {
  const debtors = Object.entries(net)
    .filter(([, v]) => v < -0.01)
    .map(([id, v]) => ({ id, amount: -v }))
    .sort((a, b) => b.amount - a.amount);
  const creditors = Object.entries(net)
    .filter(([, v]) => v > 0.01)
    .map(([id, v]) => ({ id, amount: v }))
    .sort((a, b) => b.amount - a.amount);

  const txns: { from: string; to: string; amount: number }[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amount, creditors[j].amount);
    txns.push({ from: debtors[i].id, to: creditors[j].id, amount: pay });
    debtors[i].amount -= pay;
    creditors[j].amount -= pay;
    if (debtors[i].amount < 0.01) i += 1;
    if (creditors[j].amount < 0.01) j += 1;
  }
  return txns;
}
