/** Karte „Am Reiseziel“ : Ortszeit gegen Berlin, Wetter je Reisetag, Währungskurs, Sicherheitshinweise.
 * Die Daten holt der Server und speichert sie kurz zwischen. Fehlt eine Quelle, fehlt nur ihr Block. */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useUmfeld } from "../../hooks/useReisen";
import { HEIMAT_ZONE, ortszeit, wetterArt, zeitUnterschied } from "../../utils/umfeld";
import type { ReiseDetail, WetterArt } from "../../types/reisen";
import { KARTE } from "./ui";
import Uhr from "./Uhr";
import WetterSymbol from "./WetterSymbol";

const HINTERGRUND: Record<WetterArt | "nacht", string> = {
  sonne: "from-sky-400 to-sky-600",
  teilweise: "from-sky-500 to-slate-500",
  wolken: "from-slate-400 to-slate-600",
  nebel: "from-slate-400 to-slate-500",
  regen: "from-slate-500 to-blue-800",
  schnee: "from-slate-300 to-sky-700",
  gewitter: "from-slate-600 to-indigo-900",
  nacht: "from-indigo-900 to-slate-800",
};

function Zahl({ wert, sprache }: { wert: number; sprache: string }) {
  const stellen = wert < 10 ? 3 : 2;
  return <>{new Intl.NumberFormat(sprache, { maximumFractionDigits: stellen }).format(wert)}</>;
}

export default function AmZiel({ reise }: { reise: ReiseDetail }) {
  const { t, i18n } = useTranslation("reisen");
  const q = useUmfeld(reise.id);
  const [jetzt, setJetzt] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setJetzt(new Date()), 30000);
    return () => window.clearInterval(id);
  }, []);

  const d = q.data;
  if (!d?.verfuegbar) return null;

  const heimat = ortszeit(HEIMAT_ZONE, jetzt);
  const ziel = d.zeitzone ? ortszeit(d.zeitzone, jetzt) : null;
  const diff = d.zeitzone ? zeitUnterschied(d.zeitzone, jetzt) : null;
  const w = d.wetter;
  const art = wetterArt(w?.jetzt?.code);
  const nachts = w?.jetzt ? !w.jetzt.tag : false;
  const verlauf = HINTERGRUND[nachts && art === "sonne" ? "nacht" : art];
  const wochentag = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: "short", day: "numeric" }).format(
      new Date(`${iso}T12:00:00`),
    );

  return (
    <section
      aria-label={t("umfeld.titel", { ort: d.ort })}
      className={`${KARTE} overflow-hidden p-0`}
      data-testid="am-ziel"
    >
      <div className={`bg-gradient-to-br ${verlauf} p-4 text-white`}>
        <h2 className="text-sm font-semibold">{t("umfeld.titel", { ort: d.ort })}</h2>
        <div className="mt-3 flex flex-wrap items-center justify-around gap-4">
          {heimat && ziel && (
            <div className="flex items-center gap-5">
              <Uhr name={t("umfeld.berlin")} {...heimat} />
              <Uhr
                name={d.ort ?? ""}
                {...ziel}
                zusatz={
                  diff !== null && (
                    <p className="rounded-full bg-white/20 px-2 py-0.5 text-[11px]">
                      {diff === 0
                        ? t("umfeld.gleiche_zeit")
                        : t("umfeld.unterschied", {
                            zahl: `${diff > 0 ? "+" : "−"}${Math.abs(diff).toLocaleString(i18n.language)}`,
                          })}
                    </p>
                  )
                }
              />
            </div>
          )}
          {w?.jetzt && (
            <div className="flex items-center gap-3" data-testid="wetter-jetzt">
              <WetterSymbol art={art} tag={w.jetzt.tag} groesse={64} />
              <div>
                <p className="text-3xl font-semibold tabular-nums leading-none">{w.jetzt.temp}°</p>
                <p className="text-xs opacity-90">
                  {t(art === "sonne" && !w.jetzt.tag ? "wetter.klar_nacht" : `wetter.${art}`)}
                </p>
                <p className="text-[11px] opacity-80">{t("umfeld.jetzt")}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3 p-3">
        {w && w.tage.length > 0 && (
          <div>
            <h3 className="mb-1 text-xs font-semibold text-text-secondary">
              {t("umfeld.vorhersage")}
            </h3>
            <ul className="flex gap-2 overflow-x-auto pb-1" data-testid="wetter-tage">
              {w.tage.map((tag) => (
                <li
                  key={tag.datum}
                  className="flex min-w-[4.5rem] flex-col items-center rounded-cid bg-bg-tertiary px-2 py-2 text-center"
                >
                  <span className="text-[11px] text-text-secondary">{wochentag(tag.datum)}</span>
                  <WetterSymbol art={wetterArt(tag.code)} groesse={32} />
                  <span className="text-xs font-semibold tabular-nums">
                    {tag.max ?? "–"}°
                    <span className="ml-1 font-normal text-text-tertiary">{tag.min ?? "–"}°</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {w && w.tage.length === 0 && w.vorhersage_ab && (
          <p className="text-xs text-text-tertiary">
            {t("umfeld.vorhersage_ab", {
              datum: new Intl.DateTimeFormat(i18n.language, {
                day: "numeric",
                month: "long",
              }).format(new Date(`${w.vorhersage_ab}T12:00:00`)),
            })}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          {d.kurs && (
            <p data-testid="kurs">
              <b>1 € = </b>
              <b>
                <Zahl wert={d.kurs.kurs} sprache={i18n.language} /> {d.kurs.code}
              </b>
              <span className="ml-1 text-text-tertiary">
                · 1 {d.kurs.code} = <Zahl wert={1 / d.kurs.kurs} sprache={i18n.language} /> €
              </span>
            </p>
          )}
          {d.sicherheit && (
            <a
              href={d.sicherheit}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ca underline"
            >
              {t("umfeld.sicherheit")}
            </a>
          )}
        </div>
        <p className="text-[10px] text-text-tertiary">{t("umfeld.quellen")}</p>
      </div>
    </section>
  );
}
