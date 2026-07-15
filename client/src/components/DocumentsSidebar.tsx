import { useTripStore } from '../store/trip';
import { api } from '../lib/api';

const TYPE_ICON: Record<string, string> = {
  flight: '✈️',
  accommodation: '🏨',
  restaurant: '🍽️',
  transport: '🚆',
};

interface Props {
  tripId: string;
  canEdit: boolean;
  onClose: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsSidebar({ tripId, canEdit, onClose }: Props) {
  const { documents, reservations } = useTripStore();

  const groups = reservations
    .map((r) => ({ reservation: r, attachments: documents.filter((d) => d.reservation_id === r.id) }))
    .filter((g) => g.attachments.length > 0);

  async function remove(resId: string, attachId: string) {
    await api.delete(`/trips/${tripId}/reservations/${resId}/attachments/${attachId}`);
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-80 flex-col bg-white shadow-xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h2 className="font-bold">All Documents</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {groups.length === 0 && (
            <p className="text-center text-sm text-gray-400">
              No documents yet. Attach files to reservations to see them here.
            </p>
          )}
          {groups.map(({ reservation: r, attachments }) => (
            <div key={r.id} className="mb-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {TYPE_ICON[r.type] ?? '📋'} {r.title}
              </p>
              <div className="space-y-1">
                {attachments.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800"
                  >
                    <span className="text-base">
                      {a.mime_type === 'application/pdf' ? '📄' : '🖼️'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        {a.name}
                      </a>
                      <p className="text-xs text-gray-400">{formatSize(a.size)}</p>
                    </div>
                    {canEdit && (
                      <button
                        onClick={() => remove(r.id, a.id)}
                        className="shrink-0 text-gray-400 hover:text-red-600"
                        title="Remove"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
