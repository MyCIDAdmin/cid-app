/** Verlauf der Punkte je Region (kumuliert, monatsweise) als einfaches SVG-Liniendiagramm. */
import { useTranslation } from "react-i18next";

import type { Wettbewerb } from "../../types/regionen";

const B = 640;
const H = 260;
const RAND = { links: 44, rechts: 16, oben: 12, unten: 28 };

function schoeneObergrenze(maximum: number): number {
  if (maximum <= 10) return 10;
  const schritt = 10 ** Math.floor(Math.log10(maximum));
  return Math.ceil(maximum / schritt) * schritt;
}

export default function WettbewerbVerlauf({ verlauf }: { verlauf: Wettbewerb["verlauf"] }) {
  const { t, i18n } = useTranslation("regionen");
  const { monate, serien } = verlauf;
  const aktiv = serien.filter((s) => s.werte.some((w) => w !== 0));
  if (monate.length === 0 || aktiv.length === 0) {
    return <p className="text-sm text-text-tertiary">{t("wettbewerb.verlauf_leer")}</p>;
  }
  const maximum = schoeneObergrenze(Math.max(...aktiv.flatMap((s) => s.werte)));
  const innen = { b: B - RAND.links - RAND.rechts, h: H - RAND.oben - RAND.unten };
  const x = (i: number) =>
    RAND.links + (monate.length === 1 ? innen.b / 2 : (i / (monate.length - 1)) * innen.b);
  const y = (wert: number) => RAND.oben + innen.h - (wert / maximum) * innen.h;
  const monatName = (m: string) => {
    const [j, mm] = m.split("-").map(Number);
    return new Date(j, mm - 1, 1).toLocaleDateString(i18n.language, { month: "short" });
  };
  const ticks = [0, 0.5, 1].map((a) => Math.round(a * maximum));

  return (
    <figure>
      <svg
        viewBox={`0 0 ${B} ${H}`}
        role="img"
        aria-label={t("wettbewerb.verlauf_aria")}
        className="h-auto w-full max-w-full text-text-tertiary"
      >
        {ticks.map((wert) => (
          <g key={wert}>
            <line
              x1={RAND.links}
              x2={B - RAND.rechts}
              y1={y(wert)}
              y2={y(wert)}
              stroke="currentColor"
              strokeOpacity={0.2}
            />
            <text
              x={RAND.links - 6}
              y={y(wert) + 4}
              textAnchor="end"
              fontSize={11}
              fill="currentColor"
            >
              {wert}
            </text>
          </g>
        ))}
        {monate.map((m, i) => (
          <text key={m} x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="currentColor">
            {monatName(m)}
          </text>
        ))}
        {aktiv.map((s) => (
          <g key={s.slug}>
            <polyline
              fill="none"
              stroke={s.farbe}
              strokeWidth={2}
              strokeLinejoin="round"
              points={s.werte.map((w, i) => `${x(i)},${y(w)}`).join(" ")}
            />
            <circle
              cx={x(s.werte.length - 1)}
              cy={y(s.werte[s.werte.length - 1])}
              r={4}
              fill={s.farbe}
              stroke="var(--color-bg-primary)"
              strokeWidth={2}
            />
          </g>
        ))}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
        {aktiv.map((s) => (
          <span key={s.slug} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: s.farbe }}
            />
            {s.name}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
