/**
 * Animated hero: stylized globe with an airplane orbiting on a tilted path.
 * Pure SVG + SMIL + CSS keyframes — no dependencies, dark-mode aware.
 */
export default function Globe({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 400"
      className={`globe-hero ${className}`}
      role="img"
      aria-label="Airplane flying around the globe"
    >
      <defs>
        <radialGradient id="g-ocean" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="55%" stopColor="#4f46e5" />
          <stop offset="100%" stopColor="#312e81" />
        </radialGradient>
        <linearGradient id="g-land" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fcd34d" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
        <radialGradient id="g-glow" cx="50%" cy="50%" r="50%">
          <stop offset="60%" stopColor="#6366f1" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
        </radialGradient>
        <clipPath id="g-clip">
          <circle cx="200" cy="210" r="110" />
        </clipPath>
      </defs>

      {/* Stars */}
      <g fill="currentColor" className="globe-stars text-indigo-300 dark:text-indigo-400">
        <circle cx="52" cy="70" r="2" className="tw tw-1" />
        <circle cx="340" cy="52" r="2.5" className="tw tw-2" />
        <circle cx="368" cy="150" r="1.8" className="tw tw-3" />
        <circle cx="30" cy="190" r="1.6" className="tw tw-2" />
        <circle cx="90" cy="330" r="2" className="tw tw-3" />
        <circle cx="330" cy="330" r="1.8" className="tw tw-1" />
        <circle cx="252" cy="30" r="1.5" className="tw tw-3" />
        <path d="M70 120l2.2 5.2 5.2 2.2-5.2 2.2-2.2 5.2-2.2-5.2-5.2-2.2 5.2-2.2z" className="tw tw-2" />
        <path d="M338 240l2 4.6 4.6 2-4.6 2-2 4.6-2-4.6-4.6-2 4.6-2z" className="tw tw-1" />
      </g>

      {/* Soft halo */}
      <circle cx="200" cy="210" r="150" fill="url(#g-glow)" />

      {/* Orbit — full ring behind the globe */}
      <g transform="rotate(-18 200 210)">
        <ellipse
          cx="200"
          cy="210"
          rx="165"
          ry="60"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="3 7"
          className="text-indigo-300 dark:text-indigo-500"
          opacity="0.8"
        />
      </g>

      {/* Globe */}
      <circle cx="200" cy="210" r="110" fill="url(#g-ocean)" />
      <g clipPath="url(#g-clip)">
        {/* Abstract continents */}
        <g fill="url(#g-land)" opacity="0.95" className="globe-spin">
          <path d="M120 150q28-26 58-16t22 34q-8 20-34 18t-40-10q-14-9-6-26z" />
          <path d="M232 246q20-14 42-6t16 28q-6 18-30 16t-34-14q-8-14 6-24z" />
          <path d="M150 268q16-8 30 0t8 22q-8 14-26 10t-20-14q-4-12 8-18z" />
          <path d="M256 132q14-10 30-4t12 22q-6 14-24 12t-24-12q-4-10 6-18z" />
          <path d="M96 226q10-6 20 0t6 16q-6 10-18 7t-14-10q-2-8 6-13z" />
        </g>
        {/* Meridians + parallel */}
        <g fill="none" stroke="#c7d2fe" strokeWidth="1" opacity="0.5">
          <ellipse cx="200" cy="210" rx="110" ry="110" />
          <ellipse cx="200" cy="210" rx="66" ry="110" />
          <ellipse cx="200" cy="210" rx="24" ry="110" />
          <ellipse cx="200" cy="210" rx="110" ry="40" />
          <line x1="90" y1="210" x2="310" y2="210" />
        </g>
        {/* Day-side sheen */}
        <ellipse cx="158" cy="164" rx="64" ry="44" fill="#ffffff" opacity="0.16" />
      </g>
      <circle cx="200" cy="210" r="110" fill="none" stroke="#a5b4fc" strokeWidth="1.5" opacity="0.7" />

      {/* Drifting clouds */}
      <g fill="#ffffff" opacity="0.85">
        <g className="cloud cloud-1">
          <ellipse cx="140" cy="188" rx="20" ry="7" />
          <ellipse cx="154" cy="182" rx="12" ry="6" />
        </g>
        <g className="cloud cloud-2">
          <ellipse cx="238" cy="252" rx="16" ry="6" />
          <ellipse cx="249" cy="247" rx="10" ry="5" />
        </g>
      </g>

      {/* Orbit — front half redrawn above the globe for depth */}
      <g transform="rotate(-18 200 210)">
        <path
          d="M35 210a165 60 0 1 0 330 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="3 7"
          className="text-indigo-400 dark:text-indigo-400"
        />
      </g>

      {/* Plane on the orbit: front half (0–50% of the loop) is the near side */}
      <g transform="rotate(-18 200 210)">
        <g>
          <animateMotion
            dur="9s"
            repeatCount="indefinite"
            rotate="auto"
            path="M35 210a165 60 0 1 0 330 0a165 60 0 1 0 -330 0"
          />
          {/* Dim + shrink while passing behind the globe */}
          <g>
            <animate
              attributeName="opacity"
              values="1;1;0.25;0.25;1"
              keyTimes="0;0.46;0.54;0.94;1"
              dur="9s"
              repeatCount="indefinite"
            />
            <animateTransform
              attributeName="transform"
              type="scale"
              values="1;1;0.72;0.72;1"
              keyTimes="0;0.46;0.54;0.94;1"
              dur="9s"
              repeatCount="indefinite"
            />
            {/* Contrail */}
            <path
              d="M-40 1.5h22M-32 -3h14M-32 6h14"
              stroke="#a5b4fc"
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.7"
            />
            {/* Plane */}
            <g transform="rotate(90)">
              <path
                d="M0 -12 C2.2 -7 2.2 -4 2 0 L11 7 L11 10 L2.2 6.4 L1.6 12 L5 15 L5 17 L0 15.6 L-5 17 L-5 15 L-1.6 12 L-2.2 6.4 L-11 10 L-11 7 L-2 0 C-2.2 -4 -2.2 -7 0 -12 Z"
                fill="#ffffff"
                stroke="#4338ca"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
              <circle cx="0" cy="-6" r="1.2" fill="#4338ca" />
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}
