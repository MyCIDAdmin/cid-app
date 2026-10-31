/**
 * Digitale Mitgliedskarte (2026-10-06) — ersetzt auf „Meine Mitgliedschaft“ die Kachel der
 * aktuellen Kampagne, sobald die Mitgliedschaft bezahlt ist. Der Look folgt dem Angebot
 * (OffreAdhesion.kartenstil, in der Angebotsverwaltung wählbar): Weiß, Silber, Gold, Diamant,
 * Bronze, Onyx oder Rubin (CID-Rot, Standard). Die Stile sind feste Verläufe mit geprüft
 * lesbarem Text, keine freie Farbwahl. Der Glanz-Effekt (Metall / Hologramm) steht still, wenn
 * der Nutzer „Bewegung reduzieren“ eingestellt hat.
 *
 * Release 2026.11 : Mit `vorteile` lässt sich die Karte antippen und dreht sich um. Die Rückseite
 * zeigt die Vorteile des Angebots (mit Symbol) und die Mitgliedsnummer. Ohne `vorteile` bleibt die
 * Karte wie bisher eine einzelne Fläche.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { AvantageOffre } from "../../types/adhesion";
import { STILE } from "./kartendesign";
import { kartenStilOderStandard } from "./kartenstile";
import VorteilSymbol from "./VorteilSymbol";

export interface MitgliedsKarteProps {
  stil: string | null | undefined;
  angebot: string;
  name: string;
  mitgliedsnummer?: string;
  mitgliedSeit?: string;
  gueltigBis?: string;
  kampagne?: string;
  /** Vorteile für die Rückseite ; ohne Angabe ist die Karte nicht drehbar. */
  vorteile?: AvantageOffre[];
  /** QR-Bild der Karte (data:-URL) für die Rückseite ; ohne Angabe kein QR. */
  qr?: string;
}

/** So viele Vorteile passen lesbar auf die Rückseite ; der Rest steht in „+ n weitere“. */
const MAX_RUECKSEITE = 5;

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
  vorteile,
  qr,
}: MitgliedsKarteProps) {
  const { t } = useTranslation("adhesions");
  const [gedreht, setGedreht] = useState(false);
  const key = kartenStilOderStandard(stil);
  const s = STILE[key];
  const liste = vorteile ?? [];
  const drehbar = liste.length > 0 || !!qr;
  const flaeche = {
    background: s.fond,
    color: s.text,
    border: `1px solid ${s.rahmen}`,
  };

  return (
    <section
      aria-label={t("karte.aria", { angebot })}
      data-kartenstil={key}
      className="cid-karte relative w-full max-w-md"
      style={{ aspectRatio: "1.586 / 1", minHeight: "13rem", perspective: "1200px" }}
    >
      <div
        className="cid-flip absolute inset-0"
        data-gedreht={gedreht}
        style={{
          transformStyle: "preserve-3d",
          transform: gedreht ? "rotateY(180deg)" : undefined,
        }}
      >
        <div
          className="cid-karte-seite absolute inset-0 overflow-hidden rounded-[18px] p-5 shadow-lg"
          style={flaeche}
          aria-hidden={gedreht}
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
        </div>

        {drehbar && (
          <div
            className="cid-karte-seite absolute inset-0 overflow-hidden rounded-[18px] p-5 shadow-lg"
            style={{ ...flaeche, transform: "rotateY(180deg)" }}
            aria-hidden={!gedreht}
            data-rueckseite
          >
            <div className="relative flex h-full flex-col justify-between">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-extrabold uppercase tracking-wide">{angebot}</span>
                <span
                  className="text-[10px] font-semibold uppercase tracking-[0.2em]"
                  style={{ color: s.gedaempft }}
                >
                  {t("karte.rueckseite_titel")}
                </span>
              </div>
              <div className="flex min-h-0 items-center justify-between gap-3">
                <ul className="min-w-0 flex-1 space-y-1 text-xs sm:text-sm">
                  {liste.slice(0, MAX_RUECKSEITE).map((v) => (
                    <li key={`${v.ordre}-${v.texte_fr}`} className="flex items-center gap-2">
                      <VorteilSymbol name={v.icone} className="h-4 w-4 shrink-0" />
                      <span className="truncate">{v.texte_fr}</span>
                    </li>
                  ))}
                  {liste.length > MAX_RUECKSEITE && (
                    <li className="text-[11px]" style={{ color: s.gedaempft }}>
                      {t("karte.mehr_vorteile", { anzahl: liste.length - MAX_RUECKSEITE })}
                    </li>
                  )}
                </ul>
                {qr && (
                  <img
                    src={qr}
                    alt={t("karte.qr_alt")}
                    data-qr
                    className="h-24 w-24 shrink-0 rounded-lg bg-white p-1 shadow-sm sm:h-28 sm:w-28"
                  />
                )}
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
          </div>
        )}
      </div>

      {drehbar && (
        <button
          type="button"
          aria-pressed={gedreht}
          aria-label={gedreht ? t("karte.umdrehen_zurueck") : t("karte.umdrehen")}
          onClick={() => setGedreht((g) => !g)}
          className="absolute inset-0 z-10 rounded-[18px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ca"
        />
      )}
    </section>
  );
}
