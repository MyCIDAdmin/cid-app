/**
 * Digitale Mitgliedskarte (2026-10-06) — ersetzt auf „Meine Mitgliedschaft“ die Kachel der
 * aktuellen Kampagne, sobald die Mitgliedschaft bezahlt ist. Der Look folgt dem Angebot
 * (OffreAdhesion.kartenstil, in der Angebotsverwaltung wählbar): Weiß, Silber, Gold, Diamant,
 * Bronze, Onyx oder Rubin (CID-Rot, Standard). Die Stile sind feste Verläufe mit geprüft
 * lesbarem Text, keine freie Farbwahl. Der Glanz-Effekt (Metall / Hologramm) steht still, wenn
 * der Nutzer „Bewegung reduzieren“ eingestellt hat.
 */
import { useTranslation } from "react-i18next";

import type { KartenStil } from "../../types/adhesion";
import { kartenStilOderStandard } from "./kartenstile";

interface StilDefinition {
  fond: string;
  text: string;
  gedaempft: string;
  rahmen: string;
  /** Zusätzlicher bewegter Glanz (Metall/Hologramm) */
  glanz: boolean;
}

const STILE: Record<KartenStil, StilDefinition> = {
  weiss: {
    fond: "linear-gradient(135deg,#ffffff 0%,#f2f4f8 50%,#e3e7ee 100%)",
    text: "#1b2230",
    gedaempft: "#5b6575",
    rahmen: "#d3d9e3",
    glanz: false,
  },
  silber: {
    fond: "linear-gradient(135deg,#f5f7f9 0%,#c5ccd5 38%,#eef1f4 55%,#98a1ad 100%)",
    text: "#1c2430",
    gedaempft: "#4a5562",
    rahmen: "#aab2bd",
    glanz: true,
  },
  gold: {
    fond: "linear-gradient(135deg,#fbeaa8 0%,#d8a62e 38%,#f7de8c 55%,#a67713 100%)",
    text: "#3a2904",
    gedaempft: "#6b4d0c",
    rahmen: "#c19523",
    glanz: true,
  },
  diamant: {
    fond: "linear-gradient(135deg,#eaf7ff 0%,#b7dbf4 28%,#f6fcff 48%,#a2c9ee 68%,#d9ccff 100%)",
    text: "#0d2840",
    gedaempft: "#37566f",
    rahmen: "#9fc6e6",
    glanz: true,
  },
  bronze: {
    fond: "linear-gradient(135deg,#f1cba3 0%,#b8733a 44%,#e5a56e 60%,#87491f 100%)",
    text: "#2a1507",
    gedaempft: "#5e3414",
    rahmen: "#a2602b",
    glanz: true,
  },
  onyx: {
    fond: "linear-gradient(135deg,#2c313b 0%,#0d0f13 60%,#1c2028 100%)",
    text: "#f6f7f9",
    gedaempft: "#aeb4bf",
    rahmen: "#4b5260",
    glanz: true,
  },
  rubin: {
    fond: "linear-gradient(135deg,#e5192d 0%,#a50011 55%,#6c000c 100%)",
    text: "#ffffff",
    gedaempft: "rgba(255,255,255,0.78)",
    rahmen: "#7d000d",
    glanz: true,
  },
};

export interface MitgliedsKarteProps {
  stil: string | null | undefined;
  angebot: string;
  name: string;
  mitgliedsnummer?: string;
  mitgliedSeit?: string;
  gueltigBis?: string;
  kampagne?: string;
}

function Chip({ farbe }: { farbe: string }) {
  return (
    <svg viewBox="0 0 40 30" className="h-7 w-9" aria-hidden="true">
      <rect x="1" y="1" width="38" height="28" rx="5" fill="none" stroke={farbe} opacity="0.7" />
      <path
        d="M1 10h12v10H1M27 10h12v10H27M13 1v28M27 1v28M13 10h14M13 20h14"
        fill="none"
        stroke={farbe}
        opacity="0.55"
      />
    </svg>
  );
}

export default function MitgliedsKarte({
  stil,
  angebot,
  name,
  mitgliedsnummer,
  mitgliedSeit,
  gueltigBis,
  kampagne,
}: MitgliedsKarteProps) {
  const { t } = useTranslation("adhesions");
  const key = kartenStilOderStandard(stil);
  const s = STILE[key];

  return (
    <section
      aria-label={t("karte.aria", { angebot })}
      data-kartenstil={key}
      className="cid-karte relative w-full max-w-md overflow-hidden rounded-[18px] p-5 shadow-lg"
      style={{
        background: s.fond,
        color: s.text,
        border: `1px solid ${s.rahmen}`,
        aspectRatio: "1.586 / 1",
        minHeight: "13rem",
      }}
    >
      {s.glanz && (
        <div
          aria-hidden="true"
          className="cid-karte-glanz pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(115deg,transparent 30%,rgba(255,255,255,0.45) 45%,rgba(255,255,255,0.08) 55%,transparent 70%)",
            backgroundSize: "250% 100%",
          }}
        />
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full opacity-20"
        style={{ border: `18px solid ${s.text}` }}
      />

      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex items-center rounded-full bg-white/90 px-2.5 py-1 shadow-sm">
            <img src="/brand/logo-cid-couleur.png" alt="CID" className="h-6 w-auto" />
          </span>
          <span
            className="text-right text-[10px] font-semibold uppercase tracking-[0.2em]"
            style={{ color: s.gedaempft }}
          >
            {t("karte.titel")}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Chip farbe={s.text} />
          <div className="min-w-0">
            <div className="truncate text-xl font-extrabold leading-tight tracking-wide sm:text-2xl">
              {angebot}
            </div>
            {kampagne && (
              <div className="truncate text-[11px]" style={{ color: s.gedaempft }}>
                {kampagne}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold uppercase tracking-wider sm:text-base">
              {name}
            </div>
            {mitgliedsnummer && (
              <div
                className="font-mono text-xs tabular-nums tracking-widest"
                style={{ color: s.gedaempft }}
              >
                {mitgliedsnummer}
              </div>
            )}
          </div>
          <dl className="shrink-0 text-right text-[10px] leading-tight">
            {mitgliedSeit && (
              <div>
                <dt className="uppercase tracking-wider" style={{ color: s.gedaempft }}>
                  {t("karte.mitglied_seit")}
                </dt>
                <dd className="text-xs font-semibold tabular-nums">{mitgliedSeit}</dd>
              </div>
            )}
            {gueltigBis && (
              <div className="mt-1">
                <dt className="uppercase tracking-wider" style={{ color: s.gedaempft }}>
                  {t("karte.gueltig_bis")}
                </dt>
                <dd className="text-xs font-semibold tabular-nums">{gueltigBis}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>
    </section>
  );
}
