/** Wettersymbole als einfache SVG-Zeichnungen (Sonne, Wolke, Regen …), ohne Bibliothek. */
import { useTranslation } from "react-i18next";

import type { WetterArt } from "../../types/reisen";

const SONNE = "#f5b301";
const WOLKE = "#cbd5e1";
const WOLKE_DUNKEL = "#94a3b8";
const REGEN = "#3b82f6";

function Wolke({ x = 0, y = 0, farbe = WOLKE }: { x?: number; y?: number; farbe?: string }) {
  return (
    <path
      transform={`translate(${x} ${y})`}
      d="M14 34a8 8 0 0 1 1.6-15.8A11 11 0 0 1 36.6 16 9 9 0 0 1 38 34Z"
      fill={farbe}
    />
  );
}

function Strahlen() {
  return (
    <g stroke={SONNE} strokeWidth="2.5" strokeLinecap="round">
      {[0, 45, 90, 135, 180, 225, 270, 315].map((w) => (
        <line key={w} x1="24" y1="4" x2="24" y2="9" transform={`rotate(${w} 24 24)`} />
      ))}
    </g>
  );
}

export default function WetterSymbol({
  art,
  tag = true,
  groesse = 40,
}: {
  art: WetterArt;
  tag?: boolean;
  groesse?: number;
}) {
  const { t } = useTranslation("reisen");
  let inhalt;
  if (art === "sonne") {
    inhalt = tag ? (
      <>
        <Strahlen />
        <circle cx="24" cy="24" r="9" fill={SONNE} />
      </>
    ) : (
      <path d="M31 8a16 16 0 1 0 9 28A14 14 0 0 1 31 8Z" fill="#e2e8f0" />
    );
  } else if (art === "teilweise") {
    inhalt = (
      <>
        {tag ? (
          <>
            <circle cx="18" cy="17" r="8" fill={SONNE} />
            <g stroke={SONNE} strokeWidth="2.2" strokeLinecap="round">
              {[0, 60, 120, 180, 240, 300].map((w) => (
                <line key={w} x1="18" y1="4" x2="18" y2="7.5" transform={`rotate(${w} 18 17)`} />
              ))}
            </g>
          </>
        ) : (
          <path d="M22 5a11 11 0 1 0 6 19A9.5 9.5 0 0 1 22 5Z" fill="#e2e8f0" />
        )}
        <Wolke x={4} y={8} />
      </>
    );
  } else if (art === "wolken") {
    inhalt = (
      <>
        <Wolke x={0} y={2} farbe={WOLKE_DUNKEL} />
        <Wolke x={6} y={8} />
      </>
    );
  } else if (art === "nebel") {
    inhalt = (
      <g stroke={WOLKE_DUNKEL} strokeWidth="3" strokeLinecap="round">
        <line x1="8" y1="16" x2="40" y2="16" />
        <line x1="12" y1="24" x2="44" y2="24" />
        <line x1="8" y1="32" x2="40" y2="32" />
      </g>
    );
  } else if (art === "regen") {
    inhalt = (
      <>
        <Wolke x={0} y={-4} farbe={WOLKE_DUNKEL} />
        <g stroke={REGEN} strokeWidth="2.6" strokeLinecap="round">
          <line x1="16" y1="36" x2="13" y2="43" />
          <line x1="25" y1="36" x2="22" y2="43" />
          <line x1="34" y1="36" x2="31" y2="43" />
        </g>
      </>
    );
  } else if (art === "schnee") {
    inhalt = (
      <>
        <Wolke x={0} y={-4} farbe={WOLKE_DUNKEL} />
        <g fill="#93c5fd">
          <circle cx="15" cy="40" r="2.4" />
          <circle cx="25" cy="43" r="2.4" />
          <circle cx="34" cy="40" r="2.4" />
        </g>
      </>
    );
  } else {
    inhalt = (
      <>
        <Wolke x={0} y={-4} farbe="#64748b" />
        <path d="M25 30 19 40h5l-2 8 9-12h-5l3-6Z" fill={SONNE} />
      </>
    );
  }
  return (
    <svg
      viewBox="0 0 48 48"
      width={groesse}
      height={groesse}
      role="img"
      aria-label={t(`wetter.${art}`)}
      data-testid={`wetter-${art}`}
    >
      {inhalt}
    </svg>
  );
}
