/**
 * Alle kommenden Spiele (Heim und Auswärts) als Karten mit Filter. Hat ein Spiel schon eine Reise,
 * meldet man mit einem Tap Interesse ; sonst startet „Reise planen“ das kurze Fenster.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useSaison } from "../../hooks/useReisen";
import type { SaisonSpiel } from "../../types/reisen";
import InteresseKnopf from "./InteresseKnopf";
import ReisePlanenSheet from "./ReisePlanenSheet";
import { KNOPF, KNOPF_LEISE } from "./ui";

type Filter = "alle" | "meine" | "auswaerts" | "heim" | "ohne";
const FILTER: Filter[] = ["alle", "meine", "auswaerts", "heim", "ohne"];

function passt(s: SaisonSpiel, f: Filter): boolean {
  switch (f) {
    case "meine":
      return s.reisen.some((r) => r.mein_status);
    case "auswaerts":
      return !s.heim;
    case "heim":
      return s.heim;
    case "ohne":
      return s.reisen.length === 0;
    default:
      return true;
  }
}

function SpielKarte({ s, onPlanen }: { s: SaisonSpiel; onPlanen: (s: SaisonSpiel) => void }) {
  const { t, i18n } = useTranslation("reisen");
  const d = new Date(s.datum);
  const reise = s.reisen.find((r) => r.mein_status) ?? s.reisen[0];
  const paarung = s.heim
    ? t("start.paarung_heim", { gegner: s.gegner })
    : t("start.paarung_auswaerts", { gegner: s.gegner });
  return (
    <li
      data-testid={`saison-${s.rencontre}`}
      className="flex flex-col overflow-hidden rounded-cid-lg bg-bg-primary shadow-sm"
    >
      <div
        className={`flex items-start gap-3 bg-gradient-to-br p-3 text-white ${s.heim ? "from-[#2563eb] to-[#1e3a8a]" : "from-[#c2410c] to-[#6a0609]"}`}
      >
        <div className="rounded-cid bg-white/20 px-2 py-1 text-center leading-tight">
          <b className="block text-xl tabular-nums">
            {d.toLocaleDateString(i18n.language, { day: "2-digit" })}
          </b>
          <small className="text-[10px] uppercase">
            {d.toLocaleDateString(i18n.language, { month: "short" })}
          </small>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">{paarung}</p>
          <p className="text-[11px] opacity-90">
            {s.competition} · {s.heim ? t("saison.heim") : t("saison.auswaerts")}
          </p>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        {reise ? (
          <p className="text-xs text-text-secondary">
            {t("start.reise_label", {
              ort: reise.ziel_ort || reise.titel,
              dabei: reise.dabei,
            })}
          </p>
        ) : (
          <p className="text-xs text-text-tertiary">{t("saison.keine_reise")}</p>
        )}
        <div className="mt-auto flex flex-wrap gap-2">
          {reise ? (
            <>
              <InteresseKnopf reise={reise} />
              <Link to={`/reisen/${reise.id}`} className={KNOPF_LEISE}>
                {t("start.reise_oeffnen")}
              </Link>
            </>
          ) : (
            <button type="button" className={KNOPF} onClick={() => onPlanen(s)}>
              {t("saison.reise_planen")}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

export default function SpieleStreifen() {
  const { t } = useTranslation("reisen");
  const q = useSaison();
  const [filter, setFilter] = useState<Filter>("alle");
  const [offen, setOffen] = useState(true);
  const [plan, setPlan] = useState<SaisonSpiel | null>(null);
  const alle = q.data ?? [];
  const spiele = alle.filter((s) => passt(s, filter));
  return (
    <section aria-label={t("tab_saison")} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          aria-expanded={offen}
          aria-controls="reisen-spiele"
          onClick={() => setOffen((o) => !o)}
          className="flex items-center gap-2 text-left"
        >
          <span className="text-base font-semibold">{t("saison.titel")}</span>
          {q.data && (
            <span className="text-xs font-normal text-text-secondary">
              {t("saison.anzahl", { n: alle.length })}
            </span>
          )}
          <span aria-hidden="true" className="text-xs text-text-secondary">
            {offen ? "▴" : "▾"}
          </span>
          <span className="sr-only">{offen ? t("saison.verbergen") : t("saison.zeigen")}</span>
        </button>
        {offen && (
          <div role="group" aria-label={t("start.filter_label")} className="flex flex-wrap gap-1.5">
            {FILTER.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={f === filter}
                onClick={() => setFilter(f)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${f === filter ? "border-ca bg-ca text-white" : "border-text-tertiary/30 bg-bg-primary hover:bg-bg-tertiary"}`}
              >
                {t(`start.filter.${f}`)}
              </button>
            ))}
          </div>
        )}
      </div>
      {offen && (
        <div id="reisen-spiele">
          {q.isLoading && <p className="text-sm text-text-tertiary">{t("laden")}</p>}
          {!q.isLoading && alle.length === 0 && (
            <p className="text-sm text-text-tertiary">{t("saison.leer")}</p>
          )}
          {alle.length > 0 && spiele.length === 0 && (
            <p className="text-sm text-text-tertiary">{t("start.filter_leer")}</p>
          )}
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {spiele.map((s) => (
              <SpielKarte key={s.rencontre} s={s} onPlanen={setPlan} />
            ))}
          </ul>
        </div>
      )}
      {plan && (
        <ReisePlanenSheet
          spiel={{
            rencontre: plan.rencontre,
            gegner: plan.gegner,
            heim: plan.heim,
            datum: plan.datum,
          }}
          onClose={() => setPlan(null)}
        />
      )}
    </section>
  );
}
