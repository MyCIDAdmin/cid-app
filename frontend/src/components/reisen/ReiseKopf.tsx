/**
 * Kopf des Reiseraums : Titelbild je Ziel, Countdown und je nach Phase eine andere Überschrift
 * mit dem passenden Hauptknopf. Die Phasenleiste zeigt, wo die Reise gerade steht.
 */
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { useCountdown } from "../../hooks/useCountdown";
import type { ReiseDetail } from "../../types/reisen";
import { zeitraum } from "../../utils/reisen";
import { coverFuer, hauptZiel, PHASEN, type HauptZiel } from "../../utils/reisenDesign";
import ReiseTeilen from "./ReiseTeilen";

function hauptLabel(t: TFunction<"reisen">, reise: ReiseDetail, ziel: HauptZiel): string {
  return ziel.punkt
    ? t(`jetzt_dran.${ziel.punkt.art}`, { titel: ziel.punkt.titel })
    : t(`kopf.cta.${reise.phase}`);
}

/** Auf dem Handy bleibt der nächste Schritt unten am Rand, auch beim Scrollen. */
export function ReiseDock({
  reise,
  verfuegbareTabs,
  onTab,
}: {
  reise: ReiseDetail;
  verfuegbareTabs: string[];
  onTab: (tab: string) => void;
}) {
  const { t } = useTranslation("reisen");
  const ziel = hauptZiel(reise, verfuegbareTabs);
  if (!ziel || reise.abgesagt) return null;
  return (
    <div
      data-testid="reise-dock"
      className="sticky bottom-0 z-30 -mx-4 border-t border-text-tertiary/20 bg-bg-primary/95 px-4 py-2 pr-20 backdrop-blur md:hidden"
    >
      <button
        type="button"
        onClick={() => onTab(ziel.tab)}
        className="inline-flex min-h-[44px] w-full items-center justify-center rounded-cid bg-ca px-4 text-sm font-semibold text-white hover:bg-cad"
      >
        {hauptLabel(t, reise, ziel)}
      </button>
    </div>
  );
}

function Ziffer({ wert, label }: { wert: string; label: string }) {
  return (
    <div className="min-w-[3.2rem] rounded-cid-lg border border-white/30 bg-white/15 px-2 pb-1 pt-1.5 text-center backdrop-blur-sm">
      <b className="block text-xl font-semibold tabular-nums leading-none">{wert}</b>
      <small className="text-[10px] uppercase tracking-wider opacity-85">{label}</small>
    </div>
  );
}

export default function ReiseKopf({
  reise,
  verfuegbareTabs,
  onTab,
}: {
  reise: ReiseDetail;
  /** Reiter, die diese Person sieht ; der Hauptknopf führt nur dorthin. */
  verfuegbareTabs: string[];
  onTab: (tab: string) => void;
}) {
  const { t, i18n } = useTranslation("reisen");
  const rest = useCountdown(reise.start ? `${reise.start}T00:00:00` : undefined);
  const zwei = (n: number) => String(n).padStart(2, "0");
  const phaseIndex = PHASEN.indexOf(reise.phase);

  const ziel = hauptZiel(reise, verfuegbareTabs);
  const knopf = ziel ? { label: hauptLabel(t, reise, ziel), tab: ziel.tab } : null;

  return (
    <header
      data-testid="reise-kopf"
      className={`relative overflow-hidden rounded-[22px] bg-gradient-to-br ${coverFuer(reise.ziel_ort || reise.titel)} p-5 text-white shadow-lg`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest opacity-90">
            {[reise.ziel_ort, reise.land, reise.stadion].filter(Boolean).join(", ")}
            {reise.start
              ? ` · ${zeitraum(reise.start, reise.ende, i18n.language)}`
              : ` · ${t("liste.datum_offen")}`}
          </p>
          <h1 className="mt-1 text-2xl font-semibold leading-tight sm:text-3xl">{reise.titel}</h1>
        </div>
        <ReiseTeilen reise={reise} variant="inverse" />
      </div>

      {reise.abgesagt ? (
        <p className="mt-2 text-sm font-semibold">{t("liste.abgesagt")}</p>
      ) : (
        <>
          <p className="mt-3 text-lg font-semibold">{t(`kopf.phase_titel.${reise.phase}`)}</p>
          <p className="text-sm opacity-90">{t(`kopf.phase_zeile.${reise.phase}`)}</p>
        </>
      )}

      {rest && !rest.vorbei && !reise.abgesagt && (
        <div role="timer" aria-label={t("start.countdown")} className="mt-3 flex flex-wrap gap-2">
          <Ziffer wert={String(rest.tage)} label={t("start.tage")} />
          <Ziffer wert={zwei(rest.stunden)} label={t("start.std")} />
          <Ziffer wert={zwei(rest.minuten)} label={t("start.min")} />
        </div>
      )}

      <ol className="mt-3 flex flex-wrap gap-1.5 text-[11px]" aria-label={t("phase.label")}>
        {PHASEN.map((p, i) => (
          <li
            key={p}
            aria-current={i === phaseIndex ? "step" : undefined}
            className={`rounded-full px-2.5 py-1 ${i === phaseIndex ? "bg-white font-semibold text-cad" : i < phaseIndex ? "bg-white/30" : "bg-white/15 opacity-80"}`}
          >
            {i < phaseIndex && <span aria-hidden="true">✓ </span>}
            {t(`phase.${p}`)}
          </li>
        ))}
      </ol>

      <p className="mt-3 text-sm">
        <b>{t("start.dabei_zaehler", { dabei: reise.dabei, interessiert: reise.interessiert })}</b>
        {reise.min_teilnehmer
          ? ` · ${reise.findet_statt ? t("liste.findet_statt") : t("liste.ab_personen", { n: reise.min_teilnehmer })}`
          : ""}
        {reise.mein_status && ` · ${t(`status.${reise.mein_status}`)}`}
      </p>

      {knopf && !reise.abgesagt && (
        <button
          type="button"
          onClick={() => onTab(knopf.tab)}
          data-testid="reise-kopf-cta"
          className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-cid bg-white px-4 text-sm font-semibold text-cad hover:bg-cal"
        >
          {knopf.label}
        </button>
      )}
    </header>
  );
}
