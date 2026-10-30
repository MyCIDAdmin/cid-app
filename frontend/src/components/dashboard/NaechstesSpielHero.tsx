/**
 * Kopfbereich der Übersicht : das nächste Spiel mit laufendem Countdown, den wichtigsten Wegen
 * (Tipp, Reise, Ticket) und, wenn es zum Spiel eine sichtbare Reise gibt, „Am Reiseziel“
 * (Ortszeit, Wetter, Kurs). Heim- und Auswärtsspiele zählen gleich : für die Fans in Deutschland
 * ist jedes Spiel eine Reise.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useCalendrierRencontres } from "../../hooks/useCommunaute";
import { useCountdown } from "../../hooks/useCountdown";
import { useModuleOuvert } from "../../hooks/useRbac";
import { useSaison, useUmfeld } from "../../hooks/useReisen";
import type { ReiseListItem } from "../../types/reisen";
import { gegnerName, istHeimspiel, naechstesSpiel } from "../../utils/uebersicht";
import { HEIMAT_ZONE, ortszeit, wetterArt, zeitUnterschied } from "../../utils/umfeld";

const KNOPF_HELL =
  "inline-flex min-h-[44px] items-center justify-center rounded-cid px-4 text-sm font-semibold transition-colors";

function Ziffer({ wert, label }: { wert: string; label: string }) {
  return (
    <div className="min-w-[3.6rem] flex-1 rounded-cid-lg border border-white/30 bg-white/15 px-2 pb-1.5 pt-2 text-center backdrop-blur-sm sm:flex-none sm:min-w-[4.2rem]">
      <b className="block text-2xl font-semibold tabular-nums leading-none sm:text-3xl">{wert}</b>
      <small className="text-[10px] uppercase tracking-wider opacity-85">{label}</small>
    </div>
  );
}

function ZielPanel({ reiseId }: { reiseId: string }) {
  const { t, i18n } = useTranslation("reisen");
  const q = useUmfeld(reiseId);
  const [jetzt, setJetzt] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setJetzt(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const d = q.data;
  if (!d?.verfuegbar) return null;
  const heimat = ortszeit(HEIMAT_ZONE, jetzt);
  const ziel = d.zeitzone ? ortszeit(d.zeitzone, jetzt) : null;
  const diff = d.zeitzone ? zeitUnterschied(d.zeitzone, jetzt) : null;
  const w = d.wetter?.jetzt;
  const art = wetterArt(w?.code);
  return (
    <div
      className="flex min-w-[220px] flex-col gap-2 rounded-cid-lg border border-white/30 bg-white/15 p-4 backdrop-blur-sm lg:w-64"
      data-testid="hero-am-ziel"
    >
      <p className="text-[11px] font-semibold uppercase tracking-widest opacity-85">
        {t("umfeld.titel", { ort: d.ort })}
      </p>
      {heimat && ziel && (
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-xs opacity-85">{t("umfeld.berlin")}</p>
            <p className="text-2xl font-semibold tabular-nums">{heimat.text}</p>
          </div>
          <div className="text-right">
            <p className="text-xs opacity-85">
              {d.ort}
              {diff !== null && diff !== 0 && ` · ${diff > 0 ? "+" : "−"}${Math.abs(diff)} Std.`}
            </p>
            <p className="text-2xl font-semibold tabular-nums">{ziel.text}</p>
          </div>
        </div>
      )}
      {(w || d.kurs) && <div className="h-px bg-white/30" />}
      <p className="text-sm">
        {w && (
          <span className="font-semibold">
            {w.temp}° <span className="font-normal opacity-90">{t(`wetter.${art}`)}</span>
          </span>
        )}
        {w && d.kurs && <span className="opacity-60"> · </span>}
        {d.kurs && (
          <span className="opacity-90">
            1 € ={" "}
            {new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 }).format(d.kurs.kurs)}{" "}
            {d.kurs.code}
          </span>
        )}
      </p>
    </div>
  );
}

export default function NaechstesSpielHero() {
  const { t, i18n } = useTranslation("dashboard");
  const liveOffen = useModuleOuvert("live").ouvert;
  const reisenOffen = useModuleOuvert("covoiturage").ouvert;
  const spiele = useCalendrierRencontres();
  const saison = useSaison(reisenOffen);
  const spiel = useMemo(() => naechstesSpiel(spiele.data?.results), [spiele.data]);
  const rest = useCountdown(spiel?.date_heure);
  if (!spiel || !rest) return null;

  const reisen: ReiseListItem[] = saison.data?.find((s) => s.rencontre === spiel.id)?.reisen ?? [];
  const reise = reisen.find((r) => r.mein_status) ?? reisen[0];
  const heim = istHeimspiel(spiel);
  const zwei = (n: number) => String(n).padStart(2, "0");
  const datum = new Date(spiel.date_heure).toLocaleString(i18n.language, {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <section
      aria-label={t("uebersicht.hero.titel")}
      data-testid="hero"
      className="relative flex flex-wrap items-stretch gap-5 overflow-hidden rounded-[22px] bg-gradient-to-br from-[#e0161b] via-cad to-[#6d0508] p-5 text-white shadow-lg sm:p-6"
    >
      <div className="relative z-10 min-w-0 flex-1 basis-80">
        <p className="text-[11px] font-semibold uppercase tracking-widest opacity-85">
          {t("uebersicht.hero.eyebrow", {
            art: t(heim ? "uebersicht.hero.heim" : "uebersicht.hero.auswaerts"),
            wettbewerb: spiel.competition,
          })}
        </p>
        <h2 className="mt-1 text-2xl font-semibold leading-tight sm:text-3xl">
          {spiel.equipe_domicile}
          <span className="px-2 text-base font-normal opacity-75">
            {t("uebersicht.hero.gegen")}
          </span>
          {spiel.equipe_exterieur}
        </h2>
        <p className="text-sm opacity-90">
          {datum}
          <span className="sr-only"> {gegnerName(spiel)}</span>
        </p>
        <div
          role="timer"
          aria-label={t("uebersicht.hero.countdown")}
          className="my-4 flex flex-wrap gap-2"
        >
          {rest.vorbei ? (
            <p className="text-lg font-semibold">{t("uebersicht.hero.laeuft")}</p>
          ) : (
            <>
              <Ziffer wert={String(rest.tage)} label={t("uebersicht.hero.tage")} />
              <Ziffer wert={zwei(rest.stunden)} label={t("uebersicht.hero.std")} />
              <Ziffer wert={zwei(rest.minuten)} label={t("uebersicht.hero.min")} />
              <Ziffer wert={zwei(rest.sekunden)} label={t("uebersicht.hero.sek")} />
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {liveOffen && (
            <Link to="/live" className={`${KNOPF_HELL} bg-white text-cad hover:bg-cal`}>
              {t("uebersicht.hero.tipp")}
            </Link>
          )}
          {reisenOffen &&
            (reise ? (
              <Link
                to={`/reisen/${reise.id}`}
                className={`${KNOPF_HELL} border border-white/45 bg-white/15 hover:bg-white/25`}
              >
                {t("uebersicht.hero.reise_ansehen", { dabei: reise.dabei })}
              </Link>
            ) : (
              <Link
                to={`/reisen/neu?rencontre=${spiel.id}`}
                className={`${KNOPF_HELL} border border-white/45 bg-white/15 hover:bg-white/25`}
              >
                {t("uebersicht.hero.reise_planen")}
              </Link>
            ))}
          <Link
            to="/tickets"
            className={`${KNOPF_HELL} border border-white/45 bg-white/15 hover:bg-white/25`}
          >
            {t("uebersicht.hero.ticket")}
          </Link>
        </div>
      </div>
      {reisenOffen && reise && <ZielPanel reiseId={reise.id} />}
    </section>
  );
}
