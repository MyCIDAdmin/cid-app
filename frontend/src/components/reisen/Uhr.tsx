/** Analoguhr mit digitaler Zeit darunter. Tag und Nacht färben das Zifferblatt. */
import type { ReactNode } from "react";

export default function Uhr({
  name,
  stunde,
  minute,
  text,
  zusatz,
}: {
  name: string;
  stunde: number;
  minute: number;
  text: string;
  zusatz?: ReactNode;
}) {
  const nacht = stunde < 6 || stunde >= 20;
  const stundenWinkel = ((stunde % 12) + minute / 60) * 30;
  const minutenWinkel = minute * 6;
  const flaeche = nacht ? "#1e293b" : "#ffffff";
  const zeiger = nacht ? "#f8fafc" : "#1e293b";
  return (
    <div className="flex flex-col items-center gap-1" data-testid={`uhr-${name}`}>
      <svg viewBox="0 0 64 64" width="72" height="72" role="img" aria-label={`${name} ${text}`}>
        <circle cx="32" cy="32" r="30" fill={flaeche} stroke="#e2e8f0" strokeWidth="3" />
        {Array.from({ length: 12 }, (_, i) => (
          <line
            key={i}
            x1="32"
            y1="6"
            x2="32"
            y2={i % 3 === 0 ? 11 : 9}
            stroke={nacht ? "#94a3b8" : "#64748b"}
            strokeWidth={i % 3 === 0 ? 2 : 1}
            transform={`rotate(${i * 30} 32 32)`}
          />
        ))}
        <line
          x1="32"
          y1="32"
          x2="32"
          y2="18"
          stroke={zeiger}
          strokeWidth="3"
          strokeLinecap="round"
          transform={`rotate(${stundenWinkel} 32 32)`}
        />
        <line
          x1="32"
          y1="32"
          x2="32"
          y2="11"
          stroke={zeiger}
          strokeWidth="2"
          strokeLinecap="round"
          transform={`rotate(${minutenWinkel} 32 32)`}
        />
        <circle cx="32" cy="32" r="2.5" fill="#e11d48" />
      </svg>
      <p className="text-lg font-semibold tabular-nums leading-none">{text}</p>
      <p className="text-[11px] opacity-80">{name}</p>
      {zusatz}
    </div>
  );
}
