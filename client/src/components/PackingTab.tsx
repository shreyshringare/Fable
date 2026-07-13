import { FormEvent, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useTripStore } from '../store/trip';
import type { PackingItem } from '../types';

const CATEGORIES = ['general', 'clothes', 'toiletries', 'electronics', 'documents', 'medicine', 'gear'];

export default function PackingTab({ canEdit }: { canEdit: boolean }) {
  const { packing, members, tripId, patchPacking } = useTripStore();
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState('general');
  const [quantity, setQuantity] = useState(1);
  const [assignee, setAssignee] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterPerson, setFilterPerson] = useState('');

  const filtered = useMemo(
    () =>
      packing.filter(
        (i) =>
          (!filterCat || i.category === filterCat) &&
          (!filterPerson || i.assigned_to_user_id === filterPerson),
      ),
    [packing, filterCat, filterPerson],
  );

  const packedCount = packing.filter((i) => i.packed).length;
  const pct = packing.length ? Math.round((packedCount / packing.length) * 100) : 0;

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    setLabel('');
    await api.post(`/trips/${tripId}/packing`, {
      label: label.trim(),
      category,
      quantity,
      assigned_to_user_id: assignee || undefined,
    });
  }

  async function toggle(item: PackingItem) {
    // Optimistic: checkbox flips instantly, WS event confirms.
    patchPacking({ ...item, packed: !item.packed });
    try {
      await api.patch(`/trips/${tripId}/packing/${item.id}`, { packed: !item.packed });
    } catch {
      patchPacking(item);
    }
  }

  async function remove(id: string) {
    await api.delete(`/trips/${tripId}/packing/${id}`);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-bold">Packing list</h2>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {packedCount} of {packing.length} packed
          </span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-amber-400 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <select className="input !w-auto" value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
          ))}
        </select>
        <select className="input !w-auto" value={filterPerson} onChange={(e) => setFilterPerson(e.target.value)}>
          <option value="">Everyone</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      <div className="card divide-y divide-gray-100 dark:divide-gray-700">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center py-12 text-center">
            <div className="text-5xl">🎒</div>
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
              {packing.length === 0 ? 'Nothing on the list yet.' : 'No items match the filters.'}
            </p>
          </div>
        )}
        {filtered.map((item) => (
          <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
            <input
              type="checkbox"
              className="h-5 w-5 accent-indigo-600"
              checked={item.packed}
              disabled={!canEdit}
              onChange={() => toggle(item)}
            />
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${item.packed ? 'text-gray-400 line-through' : ''}`}>
                {item.label}
                {item.quantity > 1 && <span className="ml-1 text-xs text-gray-400">×{item.quantity}</span>}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {item.category.charAt(0).toUpperCase() + item.category.slice(1)}
                {item.assigned_to_user_id &&
                  ` · ${members.find((m) => m.id === item.assigned_to_user_id)?.name ?? '—'}`}
              </p>
            </div>
            {canEdit && (
              <button onClick={() => remove(item.id)} className="text-gray-400 hover:text-red-600">
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      {canEdit && (
        <form onSubmit={add} className="card flex flex-wrap items-end gap-2 p-4">
          <div className="min-w-40 flex-1">
            <label className="label">Item</label>
            <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Sunscreen" />
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
          </div>
          <div className="w-20">
            <label className="label">Qty</label>
            <input
              type="number"
              min={1}
              className="input"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value) || 1)}
            />
          </div>
          <div>
            <label className="label">Assign to</label>
            <select className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Anyone</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <button className="btn-primary">Add</button>
        </form>
      )}
    </div>
  );
}
