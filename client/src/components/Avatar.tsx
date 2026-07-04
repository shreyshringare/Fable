const PALETTE = ['#4f46e5', '#0891b2', '#d97706', '#dc2626', '#059669', '#7c3aed', '#db2777'];

export default function Avatar({
  name,
  url,
  size = 32,
  title,
}: {
  name: string;
  url?: string | null;
  size?: number;
  title?: string;
}) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        title={title ?? name}
        className="rounded-full object-cover ring-2 ring-white dark:ring-gray-800"
        style={{ width: size, height: size }}
      />
    );
  }
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const color = PALETTE[(name.charCodeAt(0) || 0) % PALETTE.length];
  return (
    <div
      title={title ?? name}
      className="flex items-center justify-center rounded-full font-semibold text-white ring-2 ring-white dark:ring-gray-800"
      style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.4 }}
    >
      {initials}
    </div>
  );
}
