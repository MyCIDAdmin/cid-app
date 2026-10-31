/**
 * „Nächster Schritt“ auf „Meine Mitgliedschaft“ (Release 2026.11) : genau ein Hinweis, der je nach
 * Stand der Mitgliedschaft sagt, was jetzt zu tun ist (oder dass nichts zu tun ist). Ersetzt die
 * bisher verstreuten Hinweiskästen als erste Orientierung ; die Details (Nachweis-Upload,
 * Zahlungsinfos, Angebote) bleiben dort, wo sie waren, der Knopf springt nur hin.
 */
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { type SchrittArt, type SchrittZiel } from "./naechsterSchritt";

const STIL: Record<SchrittArt, { kasten: string; punkt: string }> = {
  ok: { kasten: "bg-status-successBg", punkt: "bg-status-successText" },
  bald: { kasten: "bg-status-warningBg", punkt: "bg-status-warningText" },
  nachweis: { kasten: "bg-status-warningBg", punkt: "bg-status-warningText" },
  zahlung: { kasten: "bg-status-warningBg", punkt: "bg-status-warningText" },
  abgelehnt: { kasten: "bg-status-dangerBg", punkt: "bg-status-dangerText" },
  beitreten: { kasten: "bg-cal", punkt: "bg-ca" },
  wieder: { kasten: "bg-cal", punkt: "bg-ca" },
};

const ZIEL_DER_ART: Partial<Record<SchrittArt, SchrittZiel>> = {
  nachweis: "nachweis",
  zahlung: "zahlung",
  abgelehnt: "angebote",
  beitreten: "angebote",
  wieder: "angebote",
};

const KNOPF =
  "rounded-cid bg-ca px-3 py-1.5 text-sm font-semibold text-white hover:bg-cad focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ca";
const KNOPF_RAND =
  "rounded-cid border border-text-tertiary/30 bg-bg-primary px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-bg-tertiary";

export default function NaechsterSchritt({
  art,
  tage,
  betrag,
  onZiel,
}: {
  art: SchrittArt;
  tage: number | null;
  betrag?: string;
  onZiel: (ziel: SchrittZiel) => void;
}) {
  const { t } = useTranslation("adhesions");
  const stil = STIL[art];
  const ziel = ZIEL_DER_ART[art];

  return (
    <section
      aria-label={t("naechster.kicker")}
      data-schritt={art}
      className={`mb-5 flex flex-wrap items-center gap-3 rounded-cid-lg p-4 ${stil.kasten}`}
    >
      <span
        aria-hidden="true"
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white ${stil.punkt}`}
      >
        {art === "ok" ? "✓" : "!"}
      </span>
      <div className="min-w-0 flex-1 basis-56">
        <div className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
          {t("naechster.kicker")}
        </div>
        <h2 className="text-sm font-bold text-text-primary">{t(`naechster.${art}_titel`)}</h2>
        <p className="text-sm text-text-secondary">
          {t(`naechster.${art}_text`, { tage: tage ?? 0, betrag: betrag ?? "" })}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {ziel && (
          <button type="button" className={KNOPF} onClick={() => onZiel(ziel)}>
            {t(`naechster.${art}_knopf`)}
          </button>
        )}
        {art === "ok" && (
          <>
            <Link to="/boutique" className={KNOPF_RAND}>
              {t("naechster.ok_shop")}
            </Link>
            <Link to="/evenements" className={KNOPF_RAND}>
              {t("naechster.ok_events")}
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
