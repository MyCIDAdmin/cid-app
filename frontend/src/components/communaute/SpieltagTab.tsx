/**
 * Reiter „Spieltag“ im Fan-Club (Fan-Club-Umbau 2026-11, Vorschlag B) : alles zum nächsten Spiel
 * an einem Ort – Countdown, Tipp-Stimmung der Community (erst nach der Tippsperre, nur für
 * bestätigte Teilnehmer), offene Tipps, Formvergleich mit dem Gegner, letztes Ergebnis und
 * „Spieler des Spiels“ (eine Stimme je Mitglied, 26 h nach Abpfiff).
 *
 * Es gibt keine eigene Datenhaltung : Spiele und Tabelle kommen aus den bekannten Hooks, Tipps
 * aus der Tipp-Matrix, die Abstimmung aus ihrem Endpunkt. Fehlt etwas (kein Tippspiel, keine
 * Teilnahme, Gegner nicht in der Tabelle), verschwindet nur der betroffene Block.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import {
  useCalendrierRencontres,
  useClassementLigue,
  useMeinTippstand,
  useSpielerDesSpiels,
  useStimmeFuerSpieler,
  useTippspielMatrix,
} from "../../hooks/useCommunaute";
import { useAuthStore } from "../../store/authStore";
import type { ClassementLigue, RencontreCalendrier } from "../../types/communaute";
import { extractApiErrorMessage } from "../../utils/apiError";
import { lokaleSprache } from "../../utils/datum";
import {
  ausgang,
  EQUIPE_SUIVIE,
  istClubSpiel,
  istHeimspiel,
  SPERRE_VOR_ANPFIFF_MS,
  tendenzVerteilung,
  tippGruppen,
  tippsOffen,
} from "../../utils/fanclub";
import EquipeLogoImage from "./EquipeLogoImage";

export type SpieltagZiel = "tippspiel" | "spielplan" | "tabelle";

function useJetzt(intervallMs = 30_000): number {
  const [jetzt, setJetzt] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setJetzt(Date.now()), intervallMs);
    return () => window.clearInterval(id);
  }, [intervallMs]);
  return jetzt;
}

function Karte({
  titel,
  children,
  testId,
}: {
  titel: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section className="rounded-cid-lg bg-bg-primary p-4 shadow-sm" data-testid={testId}>
      <h2 className="mb-3 text-xs font-bold uppercase text-text-tertiary">{titel}</h2>
      {children}
    </section>
  );
}

function Countdown({ ziel, jetzt }: { ziel: string; jetzt: number }) {
  const { t } = useTranslation("communaute");
  const rest = Math.max(0, new Date(ziel).getTime() - jetzt);
  const tage = Math.floor(rest / 86_400_000);
  const stunden = Math.floor((rest % 86_400_000) / 3_600_000);
  const minuten = Math.floor((rest % 3_600_000) / 60_000);
  const teil = (wert: number, label: string) => (
    <div className="min-w-[3.25rem] rounded-cid bg-white/15 px-2 py-1.5 text-center">
      <div className="text-xl font-bold tabular-nums">{wert}</div>
      <div className="text-[10px] uppercase tracking-wide text-white/75">{label}</div>
    </div>
  );
  return (
    <div className="flex gap-2" role="timer" aria-label={t("spieltag.countdown_label")}>
      {teil(tage, t("spieltag.tage"))}
      {teil(stunden, t("spieltag.stunden"))}
      {teil(minuten, t("spieltag.minuten"))}
    </div>
  );
}

function Formpunkte({ forme }: { forme: string }) {
  const { t } = useTranslation("communaute");
  if (!forme) return <span className="text-text-tertiary">–</span>;
  const farbe: Record<string, string> = {
    V: "bg-status-successText",
    N: "bg-text-tertiary",
    D: "bg-status-dangerText",
  };
  return (
    <span className="flex gap-1" aria-label={forme}>
      {forme.split("").map((code, index) => (
        <span
          key={index}
          title={t(`live.forme_${code}`, { defaultValue: code })}
          className={`h-2.5 w-2.5 rounded-full ${farbe[code] ?? farbe.N}`}
        />
      ))}
    </span>
  );
}

function FormVergleich({ eigene, gegner }: { eigene: ClassementLigue; gegner: ClassementLigue }) {
  const { t } = useTranslation("communaute");
  const zeile = (z: ClassementLigue) => (
    <tr key={z.id} className="border-t border-text-tertiary/10 first:border-t-0">
      <th scope="row" className="py-1.5 text-left font-medium text-text-primary">
        {z.equipe}
      </th>
      <td className="py-1.5 text-center tabular-nums">{z.rang}.</td>
      <td className="py-1.5 text-center font-bold tabular-nums">{z.points}</td>
      <td className="py-1.5">
        <Formpunkte forme={z.forme_recente} />
      </td>
    </tr>
  );
  return (
    <Karte titel={t("spieltag.form_titel")} testId="spieltag-form">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase text-text-tertiary">
            <th />
            <th>{t("live.classement_rang")}</th>
            <th>{t("live.classement_points")}</th>
            <th className="text-left">{t("live.classement_forme")}</th>
          </tr>
        </thead>
        <tbody>
          {zeile(eigene)}
          {zeile(gegner)}
        </tbody>
      </table>
    </Karte>
  );
}

function SpielerDesSpielsKarte() {
  const { t } = useTranslation("communaute");
  const user = useAuthStore((s) => s.user);
  const { data, isLoading } = useSpielerDesSpiels("", Boolean(user));
  const stimme = useStimmeFuerSpieler();
  const [auswahl, setAuswahl] = useState("");
  const [fehler, setFehler] = useState("");
  const jetzt = useJetzt(60_000);

  if (isLoading || !data || !data.rencontre || !data.spiel) return null;
  const spiel = data.spiel;
  const abgestimmt = Boolean(data.meine_stimme);
  const ergebnis = data.ergebnis ?? null;
  const maximum = ergebnis?.[0]?.stimmen ?? 0;

  function abgeben() {
    if (!auswahl || !data?.rencontre) return;
    setFehler("");
    stimme.mutate(
      { rencontre: data.rencontre, spieler: auswahl },
      { onError: (err) => setFehler(extractApiErrorMessage(err, t("spieltag.spieler_fehler"))) },
    );
  }

  const bis = data.bis ? new Date(data.bis).getTime() : 0;
  const reststunden = Math.max(0, Math.ceil((bis - jetzt) / 3_600_000));

  return (
    <Karte titel={t("spieltag.spieler_titel")} testId="spieler-des-spiels">
      <p className="mb-3 text-sm text-text-secondary">
        {spiel.equipe_domicile} {spiel.score_domicile}:{spiel.score_exterieur}{" "}
        {spiel.equipe_exterieur}
      </p>

      {data.offen && !abgestimmt && (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-text-secondary">
            {t("spieltag.spieler_waehlen")}
            <select
              value={auswahl}
              onChange={(e) => setAuswahl(e.target.value)}
              className="mt-1 block w-full rounded-cid border border-text-tertiary/30 bg-bg-primary px-2 py-1.5 text-sm text-text-primary"
            >
              <option value="">{t("spieltag.spieler_platzhalter")}</option>
              {(data.kandidaten ?? []).map((k) => (
                <option key={k.id} value={k.id}>
                  {k.numero ? `${k.numero} · ` : ""}
                  {k.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!auswahl || stimme.isPending}
              onClick={abgeben}
              className="rounded-cid bg-ca px-4 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
            >
              {t("spieltag.spieler_abstimmen")}
            </button>
            <span className="text-[11px] text-text-tertiary">
              {t("spieltag.spieler_offen_bis", { stunden: reststunden })}
            </span>
          </div>
          {fehler && <p className="text-xs text-status-dangerText">{fehler}</p>}
        </div>
      )}

      {data.offen && abgestimmt && (
        <p className="mb-2 text-xs text-status-successText">{t("spieltag.spieler_danke")}</p>
      )}
      {!data.offen && (
        <p className="mb-2 text-xs text-text-tertiary">{t("spieltag.spieler_beendet")}</p>
      )}

      {ergebnis && (
        <>
          {ergebnis.length === 0 ? (
            <p className="text-sm text-text-tertiary">{t("spieltag.spieler_keine_stimmen")}</p>
          ) : (
            <ul className="space-y-2" data-testid="spieler-ergebnis">
              {ergebnis.slice(0, 5).map((z) => (
                <li
                  key={z.name}
                  className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-2"
                >
                  <span className="truncate text-sm font-medium text-text-primary">{z.name}</span>
                  <span
                    className="h-2 overflow-hidden rounded-full bg-bg-secondary"
                    aria-hidden="true"
                  >
                    <span
                      className="block h-full rounded-full bg-ca"
                      style={{ width: `${maximum ? (z.stimmen / maximum) * 100 : 0}%` }}
                    />
                  </span>
                  <span className="text-sm font-bold tabular-nums text-text-primary">
                    {z.stimmen}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-text-tertiary">
            {t("spieltag.spieler_gesamt", { count: data.stimmen_gesamt ?? 0 })}
          </p>
        </>
      )}
    </Karte>
  );
}

export default function SpieltagTab({ onWechsel }: { onWechsel: (ziel: SpieltagZiel) => void }) {
  const { t } = useTranslation("communaute");
  const user = useAuthStore((s) => s.user);
  const jetzt = useJetzt();
  const { data: kalender, isLoading } = useCalendrierRencontres();
  const { data: tabelle } = useClassementLigue();
  const { tippspiel, bestaetigt, tippsProSpiel } = useMeinTippstand(Boolean(user));
  const matrix = useTippspielMatrix(tippspiel?.id, 8, bestaetigt).data;

  const { naechstes, letztes, offeneTipps } = useMemo(() => {
    const alle = (kalender?.results ?? []).filter((r) => istClubSpiel(r));
    const kommende = alle
      .filter((r) => r.est_a_venir && r.statut === "SCHEDULED")
      .sort((a, b) => a.date_heure.localeCompare(b.date_heure));
    const gespielt = alle
      .filter((r) => !r.est_a_venir && r.statut === "FINISHED" && r.score_domicile !== null)
      .sort((a, b) => b.date_heure.localeCompare(a.date_heure));
    return {
      naechstes: kommende[0] ?? null,
      letztes: gespielt[0] ?? null,
      offeneTipps: kommende.filter((r) => tippsOffen(r, jetzt)),
    };
  }, [kalender, jetzt]);

  if (isLoading) {
    return <p className="text-sm text-text-tertiary">{t("live.calendrier_chargement")}</p>;
  }

  const fehlend = bestaetigt ? offeneTipps.filter((r) => !tippsProSpiel.has(r.id)) : [];
  const naechsterSchluss = fehlend[0]
    ? new Date(new Date(fehlend[0].date_heure).getTime() - SPERRE_VOR_ANPFIFF_MS)
    : null;

  const zeilen = tabelle?.results ?? [];
  const eigene = zeilen.find((z) => z.equipe === EQUIPE_SUIVIE);
  const gegnerName = naechstes
    ? istHeimspiel(naechstes)
      ? naechstes.equipe_exterieur
      : naechstes.equipe_domicile
    : null;
  const gegner = gegnerName ? zeilen.find((z) => z.equipe === gegnerName) : undefined;

  return (
    <div className="space-y-4">
      {naechstes ? (
        <Hero
          spiel={naechstes}
          jetzt={jetzt}
          matrixSpalte={matrix?.spalten.find((s) => s.id === naechstes.id)}
          matrixTipps={
            matrix?.tipps_sichtbar
              ? matrix.zeilen.flatMap((z) => {
                  const tipp = z.tipps[naechstes.id];
                  return tipp ? [{ name: z.name, d: tipp.d, e: tipp.e }] : [];
                })
              : null
          }
          meinTipp={tippsProSpiel.get(naechstes.id)}
          bestaetigt={bestaetigt}
          eingeloggt={Boolean(user)}
          onWechsel={onWechsel}
        />
      ) : (
        <p className="rounded-cid-lg bg-bg-primary p-4 text-sm text-text-tertiary shadow-sm">
          {t("spieltag.kein_naechstes")}
        </p>
      )}

      {fehlend.length > 0 && naechsterSchluss && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-cid-lg border border-status-warningText/30 bg-status-warningBg p-3"
          data-testid="offene-tipps"
        >
          <p className="text-sm text-status-warningText">
            {t("spieltag.offene_tipps", { count: fehlend.length })}{" "}
            <span className="text-xs">
              {t("spieltag.naechster_schluss", {
                datum: naechsterSchluss.toLocaleString(lokaleSprache(), {
                  weekday: "short",
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              })}
            </span>
          </p>
          <button
            type="button"
            onClick={() => onWechsel("tippspiel")}
            className="rounded-cid bg-ca px-3 py-1.5 text-xs font-medium text-white hover:bg-cad"
          >
            {t("spieltag.jetzt_tippen")}
          </button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {eigene && gegner && <FormVergleich eigene={eigene} gegner={gegner} />}
        {letztes && <LetztesErgebnis spiel={letztes} meinTipp={tippsProSpiel.get(letztes.id)} />}
        {user && <SpielerDesSpielsKarte />}
      </div>
    </div>
  );
}

function Hero({
  spiel,
  jetzt,
  matrixSpalte,
  matrixTipps,
  meinTipp,
  bestaetigt,
  eingeloggt,
  onWechsel,
}: {
  spiel: RencontreCalendrier;
  jetzt: number;
  matrixSpalte: unknown;
  matrixTipps: { name: string; d: number; e: number }[] | null;
  meinTipp?: { score_domicile: number; score_exterieur: number };
  bestaetigt: boolean;
  eingeloggt: boolean;
  onWechsel: (ziel: SpieltagZiel) => void;
}) {
  const { t } = useTranslation("communaute");
  const auswaerts = spiel.equipe_exterieur === EQUIPE_SUIVIE;
  const offen = tippsOffen(spiel, jetzt);
  const gesperrt = spiel.competition === "Ligue 1" && !offen;
  const gruppen = matrixTipps ? tippGruppen(matrixTipps).slice(0, 3) : [];
  const verteilung = matrixTipps ? tendenzVerteilung(matrixTipps) : null;

  return (
    <section
      className="glass-match rounded-cid-lg bg-gradient-to-r from-ca to-cad p-5 text-white shadow-sm"
      data-testid="spieltag-hero"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/75">
            {t("spieltag.naechstes_spiel")}
            {spiel.art === "kontinental" && (
              <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-[10px]">
                {t("live.spielplan_filter_kontinental")}
              </span>
            )}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 font-display text-xl font-bold">
            <EquipeLogoImage
              equipe={spiel.equipe_domicile}
              className="h-8 w-8 shrink-0 rounded-full bg-white/90 object-contain p-0.5"
            />
            <span>
              {spiel.equipe_domicile} — {spiel.equipe_exterieur}
            </span>
            <EquipeLogoImage
              equipe={spiel.equipe_exterieur}
              className="h-8 w-8 shrink-0 rounded-full bg-white/90 object-contain p-0.5"
            />
          </div>
          <p className="mt-1 text-sm text-white/85">
            {[
              spiel.competition,
              new Date(spiel.date_heure).toLocaleString(lokaleSprache(), {
                weekday: "short",
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              }),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <Countdown ziel={spiel.date_heure} jetzt={jetzt} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium">
        <button
          type="button"
          onClick={() => onWechsel("spielplan")}
          className="rounded-cid bg-white/15 px-3 py-1.5 hover:bg-white/25"
        >
          {t("spieltag.zum_spielplan")}
        </button>
        {eingeloggt && auswaerts && (
          <Link
            to={`/reisen/neu?rencontre=${spiel.id}`}
            className="rounded-cid bg-white/15 px-3 py-1.5 hover:bg-white/25"
          >
            {t("live.calendrier_reise_organisieren")}
          </Link>
        )}
        {bestaetigt && offen && (
          <button
            type="button"
            onClick={() => onWechsel("tippspiel")}
            className="rounded-cid bg-white px-3 py-1.5 text-cad hover:bg-white/90"
          >
            {meinTipp
              ? t("spieltag.tipp_aendern", {
                  tipp: `${meinTipp.score_domicile}:${meinTipp.score_exterieur}`,
                })
              : t("spieltag.jetzt_tippen")}
          </button>
        )}
      </div>

      {bestaetigt && gesperrt && (
        <div className="mt-4 rounded-cid bg-white/10 p-3" data-testid="spieltag-stimmung">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/75">
            {t("spieltag.stimmung_titel")}
            {meinTipp && (
              <span className="ml-2 normal-case">
                {t("spieltag.dein_tipp", {
                  tipp: `${meinTipp.score_domicile}:${meinTipp.score_exterieur}`,
                })}
              </span>
            )}
          </p>
          {matrixSpalte && verteilung && gruppen.length > 0 ? (
            <>
              <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-white/20">
                <span className="bg-white" style={{ width: `${verteilung.heim}%` }} />
                <span className="bg-white/50" style={{ width: `${verteilung.remis}%` }} />
                <span className="bg-white/25" style={{ width: `${verteilung.gast}%` }} />
              </div>
              <p className="mt-1 text-[11px] text-white/85">
                {t("spieltag.verteilung", {
                  heim: verteilung.heim,
                  remis: verteilung.remis,
                  gast: verteilung.gast,
                })}
              </p>
              <ul className="mt-2 flex flex-wrap gap-2 text-xs">
                {gruppen.map((g) => (
                  <li key={g.ergebnis} className="rounded-full bg-white/15 px-2.5 py-1 font-bold">
                    {g.ergebnis} · {g.anzahl}×
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => onWechsel("tippspiel")}
                className="mt-2 text-[11px] font-medium underline"
              >
                {t("spieltag.alle_tipps")}
              </button>
            </>
          ) : (
            <p className="mt-1 text-xs text-white/85">{t("spieltag.stimmung_leer")}</p>
          )}
        </div>
      )}
    </section>
  );
}

function LetztesErgebnis({
  spiel,
  meinTipp,
}: {
  spiel: RencontreCalendrier;
  meinTipp?: { score_domicile: number; score_exterieur: number; points: number | null };
}) {
  const { t } = useTranslation("communaute");
  const art = ausgang(spiel);
  const farbe =
    art === "sieg"
      ? "bg-status-successBg text-status-successText"
      : art === "niederlage"
        ? "bg-status-dangerBg text-status-dangerText"
        : "bg-bg-secondary text-text-tertiary";
  return (
    <Karte titel={t("spieltag.letztes_ergebnis")} testId="spieltag-letztes">
      <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-text-primary">
        <EquipeLogoImage equipe={spiel.equipe_domicile} />
        <span>
          {spiel.equipe_domicile} {spiel.score_domicile} : {spiel.score_exterieur}{" "}
          {spiel.equipe_exterieur}
        </span>
        <EquipeLogoImage equipe={spiel.equipe_exterieur} />
        {art && (
          <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${farbe}`}>
            {t(`live.calendrier_resultat_${art}`)}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-text-tertiary">
        {new Date(spiel.date_heure).toLocaleDateString(lokaleSprache())} · {spiel.competition}
      </p>
      {meinTipp && (
        <p className="mt-2 text-sm text-text-secondary">
          {t("spieltag.dein_tipp_punkte", {
            tipp: `${meinTipp.score_domicile}:${meinTipp.score_exterieur}`,
            punkte: meinTipp.points ?? "–",
          })}
        </p>
      )}
    </Karte>
  );
}
