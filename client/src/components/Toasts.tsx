import { useToastStore } from '../store/toast';

const STYLE = {
  error: 'border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-900/60 dark:text-red-200',
  success:
    'border-green-300 bg-green-50 text-green-800 dark:border-green-700 dark:bg-green-900/60 dark:text-green-200',
  info: 'border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-200',
};

export default function Toasts() {
  const { toasts, dismiss } = useToastStore();
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-[2000] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`rounded-xl border px-4 py-2.5 text-left text-sm shadow-lg backdrop-blur ${STYLE[t.kind]}`}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
