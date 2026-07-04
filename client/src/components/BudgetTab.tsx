import { FormEvent, useMemo, useState } from 'react';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { api } from '../lib/api';
import { CURRENCIES, formatMoney, settleUp, toUSD } from '../lib/currency';
import { useTripStore } from '../store/trip';
import Modal from './Modal';

const COLORS = ['#4f46e5', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];
const CATEGORIES = ['transport', 'lodging', 'food', 'activities', 'shopping', 'other'];

export default function BudgetTab({ canEdit }: { canEdit: boolean }) {
  const { budget, members, tripId } = useTripStore();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    label: '',
    amount: '',
    currency: 'USD',
    category: 'food',
    paid_by_user_id: '',
    split_among: [] as string[],
  });

  const memberName = (id: string | null) =>
    members.find((m) => m.id === id)?.name ?? 'Someone';

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of budget) {
      map.set(b.category, (map.get(b.category) ?? 0) + toUSD(b.amount, b.currency));
    }
    return [...map.entries()].map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }));
  }, [budget]);

  const totalUSD = useMemo(
    () => budget.reduce((sum, b) => sum + toUSD(b.amount, b.currency), 0),
    [budget],
  );

  /** Per person: paid, share, net (positive = is owed). */
  const perPerson = useMemo(() => {
    const paid: Record<string, number> = {};
    const share: Record<string, number> = {};
    for (const m of members) {
      paid[m.id] = 0;
      share[m.id] = 0;
    }
    for (const b of budget) {
      const usd = toUSD(b.amount, b.currency);
      if (b.paid_by_user_id) paid[b.paid_by_user_id] = (paid[b.paid_by_user_id] ?? 0) + usd;
      const splitters = b.split_among.length ? b.split_among : members.map((m) => m.id);
      for (const uid of splitters) {
        share[uid] = (share[uid] ?? 0) + usd / splitters.length;
      }
    }
    const net: Record<string, number> = {};
    for (const id of Object.keys(paid)) net[id] = paid[id] - share[id];
    return { paid, share, net };
  }, [budget, members]);

  const settlements = useMemo(() => settleUp(perPerson.net), [perPerson]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    await api.post(`/trips/${tripId}/budget`, {
      label: form.label,
      amount: Number(form.amount),
      currency: form.currency,
      category: form.category,
      paid_by_user_id: form.paid_by_user_id || undefined,
      split_among: form.split_among,
    });
    setShowAdd(false);
    setForm({ ...form, label: '', amount: '', split_among: [] });
  }

  async function remove(id: string) {
    await api.delete(`/trips/${tripId}/budget/${id}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Budget</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Total: <span className="font-bold text-gray-900 dark:text-white">{formatMoney(totalUSD)}</span>{' '}
            (converted to USD)
          </p>
        </div>
        {canEdit && (
          <button className="btn-primary" onClick={() => setShowAdd(true)}>
            + Add expense
          </button>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Pie chart */}
        <div className="card p-4">
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            By category
          </h3>
          {byCategory.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">No expenses yet.</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                    {byCategory.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatMoney(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Per-person + settle up */}
        <div className="card space-y-4 p-4">
          <div>
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Per person
            </h3>
            <div className="space-y-1.5">
              {members.map((m) => {
                const net = perPerson.net[m.id] ?? 0;
                return (
                  <div key={m.id} className="flex items-center justify-between text-sm">
                    <span>{m.name}</span>
                    <span>
                      paid {formatMoney(perPerson.paid[m.id] ?? 0)} ·{' '}
                      <span className={net >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {net >= 0 ? 'is owed' : 'owes'} {formatMoney(Math.abs(net))}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Settle up
            </h3>
            {settlements.length === 0 ? (
              <p className="text-sm text-gray-400">All square. 🤝</p>
            ) : (
              <div className="space-y-1.5">
                {settlements.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="font-medium">{memberName(t.from)}</span>
                    <span className="text-gray-400">→</span>
                    <span className="font-medium">{memberName(t.to)}</span>
                    <span className="ml-auto font-bold">{formatMoney(t.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Expense list */}
      <div className="card divide-y divide-gray-100 dark:divide-gray-700">
        {budget.length === 0 && (
          <p className="p-6 text-center text-sm text-gray-400">
            Track shared costs and settle up without spreadsheets.
          </p>
        )}
        {budget.map((b) => (
          <div key={b.id} className="flex items-center gap-3 px-4 py-3">
            <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
              {b.category}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{b.label}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {memberName(b.paid_by_user_id)} paid ·{' '}
                {b.split_among.length ? `split ${b.split_among.length} ways` : 'split all'}
              </p>
            </div>
            <span className="font-bold">{formatMoney(b.amount, b.currency)}</span>
            {canEdit && (
              <button onClick={() => remove(b.id)} className="text-gray-400 hover:text-red-600">
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      {showAdd && (
        <Modal title="Add expense" onClose={() => setShowAdd(false)}>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="label">Label</label>
              <input
                className="input"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Ramen night"
                required
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="label">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="label">Currency</label>
                <select
                  className="input"
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Category</label>
                <select
                  className="input"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Paid by</label>
                <select
                  className="input"
                  value={form.paid_by_user_id}
                  onChange={(e) => setForm({ ...form, paid_by_user_id: e.target.value })}
                >
                  <option value="">Me</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Split among (empty = everyone)</label>
              <div className="flex flex-wrap gap-2">
                {members.map((m) => (
                  <label
                    key={m.id}
                    className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${
                      form.split_among.includes(m.id)
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                        : 'border-gray-300 dark:border-gray-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={form.split_among.includes(m.id)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          split_among: e.target.checked
                            ? [...form.split_among, m.id]
                            : form.split_among.filter((id) => id !== m.id),
                        })
                      }
                    />
                    {m.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setShowAdd(false)}>
                Cancel
              </button>
              <button className="btn-primary">Add</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
