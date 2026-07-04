import { useState } from 'react';

export default function DarkModeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('fable-theme', next ? 'dark' : 'light');
  }

  return (
    <button
      onClick={toggle}
      title="Toggle dark mode"
      className="rounded-lg p-2 text-lg hover:bg-gray-100 dark:hover:bg-gray-800"
    >
      {dark ? '🌙' : '☀️'}
    </button>
  );
}
