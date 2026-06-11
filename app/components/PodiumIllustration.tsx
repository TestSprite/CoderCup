// Isometric podium SVG for the hero. Verbatim port of codearena-2/index.html
// lines 946-998 — vendor-coded chart colors (blue/teal/orange) per rank,
// with composite values driven from leaderboard data.

interface TopAgent {
  rank: number;
  composite: number;
}

interface Props {
  top3?: TopAgent[];
}

const FALLBACK: TopAgent[] = [
  { rank: 1, composite: 0.465 },
  { rank: 2, composite: 0.424 },
  { rank: 3, composite: 0.372 },
];

export function PodiumIllustration({ top3 }: Props) {
  const data = top3 && top3.length > 0 ? top3.slice(0, 3) : [...FALLBACK];
  while (data.length < 3) {
    data.push({ rank: data.length + 1, composite: 0 });
  }

  const [c1, c2, c3] = data;
  const fmt = (n: number) => (n > 0 ? n.toFixed(3) : '—');

  return (
    <svg
      className="hero-illustration"
      viewBox="0 60 480 480"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="miter"
      aria-hidden
    >
      <g stroke="#E5E5E5" strokeWidth="0.6" opacity="0.95">
        <path d="M40 460 L380 290" />
        <path d="M40 500 L380 330" />
        <path d="M40 540 L380 370" />
        <path d="M80 480 L420 310" />
        <path d="M40 460 L80 480" />
        <path d="M127 416 L167 436" />
        <path d="M214 372 L254 392" />
        <path d="M301 329 L341 349" />
        <path d="M388 285 L428 305" />
      </g>
      <g stroke="#D9D9D9" strokeWidth="0.6" strokeDasharray="2 4">
        <path d="M130 168 L130 88" />
        <path d="M208 268 L208 200" />
        <path d="M286 360 L286 305" />
      </g>
      <g stroke="#2D5BFF" strokeWidth="1">
        <path d="M130 160 L181.96 190 L130 220 L78.04 190 Z" fill="rgba(45,91,255,0.06)" />
        <path d="M181.96 370 L181.96 190 L130 220 L130 400 Z" fill="rgba(45,91,255,0.04)" />
        <path d="M78.04 370 L78.04 190 L130 220 L130 400 Z" fill="rgba(45,91,255,0.08)" />
        <path d="M78.04 370 L130 400 L181.96 370" strokeWidth="1.2" />
      </g>
      <text
        x="130"
        y="199"
        textAnchor="middle"
        fontFamily="Geist Mono, ui-monospace, monospace"
        fontSize="10"
        fontWeight="600"
        fill="#2D5BFF"
      >
        {String(c1.rank).padStart(2, '0')}
      </text>
      <g fontFamily="Geist Mono, ui-monospace, monospace">
        <text x="42" y="142" fontSize="9" fill="#8E8D95" letterSpacing="1.2">
          [ RANK {String(c1.rank).padStart(2, '0')} · COMPOSITE ]
        </text>
        <text x="42" y="163" fontSize="18" fill="#0A0A0C" fontWeight="500" letterSpacing="-0.5">
          {fmt(c1.composite)}
        </text>
      </g>
      <g stroke="#15803D" strokeWidth="1.2" fill="none">
        <path d="M130 160 L130 138" />
        <circle cx="130" cy="132" r="4" fill="#15803D" />
      </g>
      <g stroke="#14B8A6" strokeWidth="0.9">
        <path d="M208 265 L259.96 295 L208 325 L156.04 295 Z" fill="rgba(20,184,166,0.05)" />
        <path d="M259.96 415 L259.96 295 L208 325 L208 445 Z" fill="rgba(20,184,166,0.03)" />
        <path d="M156.04 415 L156.04 295 L208 325 L208 445 Z" fill="rgba(20,184,166,0.07)" />
      </g>
      <text
        x="208"
        y="304"
        textAnchor="middle"
        fontFamily="Geist Mono, ui-monospace, monospace"
        fontSize="10"
        fill="#14B8A6"
      >
        {String(c2.rank).padStart(2, '0')}
      </text>
      <g fontFamily="Geist Mono, ui-monospace, monospace">
        <text x="282" y="252" fontSize="9" fill="#8E8D95" letterSpacing="1.2">
          [ {String(c2.rank).padStart(2, '0')} ]
        </text>
        <text x="282" y="270" fontSize="14" fill="#4A4A4F" letterSpacing="-0.4">
          {fmt(c2.composite)}
        </text>
      </g>
      <g stroke="#F97316" strokeWidth="0.85" opacity="0.85">
        <path d="M286 360 L337.96 390 L286 420 L234.04 390 Z" fill="rgba(249,115,22,0.05)" />
        <path d="M337.96 460 L337.96 390 L286 420 L286 490 Z" fill="rgba(249,115,22,0.03)" />
        <path d="M234.04 460 L234.04 390 L286 420 L286 490 Z" fill="rgba(249,115,22,0.07)" />
      </g>
      <text
        x="286"
        y="399"
        textAnchor="middle"
        fontFamily="Geist Mono, ui-monospace, monospace"
        fontSize="10"
        fill="#F97316"
      >
        {String(c3.rank).padStart(2, '0')}
      </text>
      <g fontFamily="Geist Mono, ui-monospace, monospace">
        <text x="360" y="350" fontSize="9" fill="#8E8D95" letterSpacing="1.2">
          [ {String(c3.rank).padStart(2, '0')} ]
        </text>
        <text x="360" y="368" fontSize="14" fill="#8E8D95" letterSpacing="-0.4">
          {fmt(c3.composite)}
        </text>
      </g>
    </svg>
  );
}
