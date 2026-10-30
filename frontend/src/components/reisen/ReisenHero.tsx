/**
 * „Deine nächste Reise“ ganz oben auf der Reisen-Seite : Countdown, Phase, wer dabei ist und was
 * jetzt ansteht („Jetzt dran“). Alles Weitere öffnet sich im Reiseraum.
 */
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useCountdown } from "../../hooks/useCountdown";
import { useReise, useReisenListe } from "../../hooks/useReisen";
import { coverFuer, naechsteReise, PHASEN, TAB_FUER_PUNKT } from "../../utils/reisenDesign";
import { zeitraum } from "../../utils/reisen";
import ReiseTeilen from "./ReiseTeilen";
import { Countdown } from "./ui";

function Ziffer({ wert, label }: { wert: string; label: string }) {
  return (
    <div className="min-w-[3.4rem] rounded-cid-lg border border-white/30 bg-white/15 px-2 pb-1.5 pt-2 text-center backdrop-blur-sm">
      <b className="block text-2xl font-semibold tabular-nums leading-none">{wert}</b>
      <small className="text-[10px] uppercase tracking-wider opacity-85">{label}</small>
    </div>
  );
}

export default function ReisenHero() {
  const { t, i18n } = useTranslation("reisen");
  const liste = useReisenListe({ meine: true });
  const reise = naechsteReise(liste.data);
  const detail = useReise(reise?.id);
  const rest = useCountdown(reise?.start ? `${reise.start}T00:00:00` : undefined);
  if (!reise) return null;

  const phase = PHASEN.indexOf(reise.phase);
  const jetzt = (detail.data?.jetzt_dran ?? []).slice(0, 3);
  const zwei = (n: number) => String(n).padStart(2, "0");

  return (
    <section
      aria-label={t("start.hero_eyebrow")}
      data-testid="reisen-hero"
      className={`relative flex flex-wrap items-stretch gap-5 overflow-hidden rounded-[22px] bg-gradient-to-br ${coverFuer(reise.ziel_ort || reise.titel)} p-5 text-white shadow-lg sm:p-6`}
    >
      <div className="relative z-10 min-w-0 flex-1 basis-72">
        <p className="text-[11px] font-semibold uppercase tracking-widest opacity-85">
          {t("start.hero_eyebrow")}
        </p>
        <h2 className="mt-1 text-3xl font-semibold leading-tight">
          {reise.ziel_ort || reise.titel}
        </h2>
        <p className="text-sm opacity-90">
          {reise.start ? zeitraum(reise.start, reise.ende, i18n.language) : t("liste.datum_offen")}
          {reise.ziel_ort ? ` · ${reise.titel}` : ""}
        </p>
        {rest && !rest.vorbei && (
          <div role="timer" aria-label={t("start.countdown")} className="my-4 flex flex-wrap gap-2">
            <Ziffer wert={String(rest.tage)} label={t("start.tage")} />
            <Ziffer wert={zwei(rest.stunden)} label={t("start.std")} />
            <Ziffer wert={zwei(rest.minuten)} label={t("start.min")} />
          </div>
        )}
        <ol className="mb-3 flex flex-wrap gap-1.5 text-[11px]" aria-label={t("phase.label")}>
          {PHASEN.map((p, i) => (
            <li
              key={p}
              aria-current={i === phase ? "step" : undefined}
              className={`rounded-full px-2.5 py-1 ${i === phase ? "bg-white font-semibold text-cad" : i < phase ? "bg-white/30" : "bg-white/15 opacity-80"}`}
            >
              {i < phase && <span aria-hidden="true">✓ </span>}
              {t(`phase.${p}`)}
            </li>
          ))}
        </ol>
        <p className="mb-4 text-sm">
          <b>
            {t("start.dabei_zaehler", { dabei: reise.dabei, interessiert: reise.interessiert })}
          </b>
          {reise.min_teilnehmer
            ? ` · ${reise.findet_statt ? t("liste.findet_statt") : t("liste.ab_personen", { n: reise.min_teilnehmer })}`
            : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/reisen/${reise.id}`}
            className="inline-flex min-h-[44px] items-center justify-center rounded-cid bg-white px-4 text-sm font-semibold text-cad hover:bg-cal"
          >
            {t("start.reiseraum_oeffnen")}
          </Link>
          {detail.data && <ReiseTeilen reise={detail.data} variant="inverse" />}
        </div>
      </div>
      {jetzt.length > 0 && (
        <div
          className="relative z-10 flex min-w-[240px] flex-1 basis-64 flex-col gap-2 rounded-cid-lg border border-white/30 bg-white/15 p-4 backdrop-blur-sm lg:max-w-sm"
          data-testid="reisen-hero-jetzt"
        >
          <p className="text-[11px] font-semibold uppercase tracking-widest opacity-85">
            {t("start.jetzt_dran", { n: jetzt.length })}
          </p>
          {jetzt.map((p, i) => (
            <div
              key={`${p.art}-${p.id ?? i}`}
              className="flex items-center justify-between gap-2 rounded-cid bg-white/15 px-3 py-2"
            >
              <span className="min-w-0 text-sm">
                <span className="block font-semibold">
                  {t(`jetzt_dran.${p.art}`, { titel: p.titel })}
                </span>
                {p.frist && (
                  <span className="text-xs opacity-90">
                    <Countdown frist={p.frist} />
                  </span>
                )}
              </span>
              <Link
                to={`/reisen/${reise.id}?tab=${TAB_FUER_PUNKT[p.art] ?? "blick"}`}
                className="shrink-0 rounded-cid border border-white/45 px-3 py-1.5 text-xs font-semibold hover:bg-white/25"
              >
                {t("jetzt_dran.oeffnen")}
              </Link>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
