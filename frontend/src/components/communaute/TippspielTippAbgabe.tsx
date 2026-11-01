/**
 * Abgabe der Tipps (Tippspiel, 2026-09-24) — une ligne par rencontre de Ligue 1 de Club
 * Africain encore ouverte aux pronostics ("Spiele aus den API Daten übernehmen", retour
 * utilisateur) : périmètre `competition === "Ligue 1"` (voir docstring de tête
 * TippspielTip côté backend), date-limite 1 jour avant le coup d'envoi ("Frist der Angabe
 * der Tipps 1 Tag vor dem Spiel") — recalculée côté client uniquement pour masquer le
 * formulaire (le backend reste seul juge, voir TippspielTipSerializer.validate).
 *
 * Les rencontres déjà couvertes par `useCalendrierRencontres()` (onglet Spielplan) sont
 * réutilisées telles quelles — même requête, même cache React Query, aucun appel réseau
 * supplémentaire côté backend.
 *
 * Fan-Club-Umbau (2026-11, Vorschlag B) : je Spiel eine Tipp-Karte mit −/+-Stepper, Schnelltasten
 * (1:0, 2:0, 2:1, 1:1) und Hinweis „Tippschluss in …“. Die Zahlenfelder und ihre Beschriftungen
 * bleiben bestehen (Tastatur, Screenreader), die Knöpfe ergänzen sie.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useCalendrierRencontres,
  useCreerTippspielTip,
  useModifierTippspielTip,
  useTippspielTipps,
} from "../../hooks/useCommunaute";
import type { RencontreCalendrier, TippspielTip } from "../../types/communaute";
import { extractApiErrorMessage } from "../../utils/apiError";
import EquipeLogoImage from "./EquipeLogoImage";
import { lokaleSprache } from "../../utils/datum";

const UN_JOUR_MS = 24 * 60 * 60 * 1000;
const SCHNELL_TIPPS: [number, number][] = [
  [1, 0],
  [2, 0],
  [2, 1],
  [1, 1],
];
const MAX_TORE = 20;

function weiter(wert: string, schritt: number): string {
  const zahl = Number(wert === "" ? 0 : wert);
  const basis = Number.isInteger(zahl) && zahl >= 0 ? zahl : 0;
  return String(Math.min(MAX_TORE, Math.max(0, basis + schritt)));
}

/** „Tippschluss in 3 Tagen / 5 Std. / 20 Min.“ (Sperre = 1 Tag vor Anpfiff). */
function sperreIn(iso: string, t: (k: string, o?: Record<string, unknown>) => string): string {
  const rest = new Date(iso).getTime() - UN_JOUR_MS - Date.now();
  const minuten = Math.max(1, Math.round(rest / 60000));
  if (minuten >= 2 * 24 * 60)
    return t("tippspiel.sperre_tage", { count: Math.floor(minuten / 1440) });
  if (minuten >= 60) return t("tippspiel.sperre_stunden", { count: Math.floor(minuten / 60) });
  return t("tippspiel.sperre_minuten", { count: minuten });
}

function Stepper({
  wert,
  onChange,
  label,
  minusLabel,
  plusLabel,
}: {
  wert: string;
  onChange: (neu: string) => void;
  label: string;
  minusLabel: string;
  plusLabel: string;
}) {
  const knopf =
    "flex h-8 w-8 items-center justify-center rounded-cid bg-bg-secondary text-base font-bold text-text-primary hover:bg-cal";
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className={knopf}
        aria-label={minusLabel}
        onClick={() => onChange(weiter(wert, -1))}
      >
        −
      </button>
      <input
        type="number"
        min={0}
        inputMode="numeric"
        value={wert}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="w-12 rounded-cid border border-text-tertiary/30 px-1 py-1 text-center text-sm tabular-nums"
      />
      <button
        type="button"
        className={knopf}
        aria-label={plusLabel}
        onClick={() => onChange(weiter(wert, 1))}
      >
        +
      </button>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(lokaleSprache());
}

function rencontresPronostiquables(rencontres: RencontreCalendrier[]): RencontreCalendrier[] {
  const maintenant = Date.now();
  return rencontres
    .filter(
      (r) =>
        r.competition === "Ligue 1" &&
        r.est_a_venir &&
        new Date(r.date_heure).getTime() - maintenant > UN_JOUR_MS,
    )
    .sort((a, b) => new Date(a.date_heure).getTime() - new Date(b.date_heure).getTime());
}

interface LigneProps {
  tippspielId: string;
  rencontre: RencontreCalendrier;
  tip?: TippspielTip;
}

function LigneTipp({ tippspielId, rencontre, tip }: LigneProps) {
  const { t } = useTranslation("communaute");
  const [scoreDomicile, setScoreDomicile] = useState(String(tip?.score_domicile ?? ""));
  const [scoreExterieur, setScoreExterieur] = useState(String(tip?.score_exterieur ?? ""));
  const [erreur, setErreur] = useState("");
  const [enregistre, setEnregistre] = useState(false);

  const creer = useCreerTippspielTip();
  const modifier = useModifierTippspielTip();
  const enCours = creer.isPending || modifier.isPending;

  function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    const domicile = Number(scoreDomicile);
    const exterieur = Number(scoreExterieur);
    if (
      !Number.isInteger(domicile) ||
      !Number.isInteger(exterieur) ||
      domicile < 0 ||
      exterieur < 0
    ) {
      return;
    }
    setErreur("");
    setEnregistre(false);
    const onError = (err: unknown) =>
      setErreur(extractApiErrorMessage(err, t("tippspiel.tipp_fehler")));
    const onSuccess = () => setEnregistre(true);
    if (tip) {
      modifier.mutate(
        { id: tip.id, payload: { score_domicile: domicile, score_exterieur: exterieur } },
        { onSuccess, onError },
      );
    } else {
      creer.mutate(
        {
          tippspiel: tippspielId,
          rencontre: rencontre.id,
          score_domicile: domicile,
          score_exterieur: exterieur,
        },
        { onSuccess, onError },
      );
    }
  }

  return (
    <form
      onSubmit={enregistrer}
      className="flex flex-wrap items-center justify-between gap-2 rounded-cid-lg bg-bg-primary p-3 shadow-sm"
    >
      <div className="min-w-0">
        {/* Logos de clubs (retour utilisateur du 2026-10-08 : "Im Tippspiel die Logos der Vereine
            übernehmen, wenn die vorhanden sind") — même composant que Tabelle/Spielplan/Nächstes
            Spiel ; EquipeLogoImage n'affiche rien tant qu'aucun logo n'existe pour ce nom. */}
        <div className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-text-primary">
          <EquipeLogoImage
            equipe={rencontre.equipe_domicile}
            className="h-6 w-6 shrink-0 object-contain"
          />
          <span className="truncate">
            {rencontre.equipe_domicile} — {rencontre.equipe_exterieur}
          </span>
          <EquipeLogoImage
            equipe={rencontre.equipe_exterieur}
            className="h-6 w-6 shrink-0 object-contain"
          />
        </div>
        <div className="text-xs text-text-tertiary">{formatDate(rencontre.date_heure)}</div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Stepper
          wert={scoreDomicile}
          onChange={setScoreDomicile}
          label={t("tippspiel.tipp_heim_label", { equipe: rencontre.equipe_domicile })}
          minusLabel={t("tippspiel.tipp_minus", { equipe: rencontre.equipe_domicile })}
          plusLabel={t("tippspiel.tipp_plus", { equipe: rencontre.equipe_domicile })}
        />
        <span className="text-text-tertiary">:</span>
        <Stepper
          wert={scoreExterieur}
          onChange={setScoreExterieur}
          label={t("tippspiel.tipp_gast_label", { equipe: rencontre.equipe_exterieur })}
          minusLabel={t("tippspiel.tipp_minus", { equipe: rencontre.equipe_exterieur })}
          plusLabel={t("tippspiel.tipp_plus", { equipe: rencontre.equipe_exterieur })}
        />
        <button
          type="submit"
          disabled={enCours}
          className="rounded-cid bg-ca px-3 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
        >
          {t("tippspiel.tipp_speichern")}
        </button>
      </div>
      <div className="flex w-full flex-wrap items-center gap-1.5" data-testid="schnelltipps">
        <span className="text-[11px] text-text-tertiary">{t("tippspiel.schnelltipp")}</span>
        {SCHNELL_TIPPS.map(([d, e]) => (
          <button
            key={`${d}:${e}`}
            type="button"
            onClick={() => {
              setScoreDomicile(String(d));
              setScoreExterieur(String(e));
            }}
            className="rounded-full border border-text-tertiary/20 px-2 py-0.5 text-[11px] font-bold tabular-nums text-text-secondary hover:bg-cal"
          >
            {d}:{e}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-text-tertiary">
          {sperreIn(rencontre.date_heure, t)}
        </span>
      </div>
      {enregistre && !erreur && (
        <p className="w-full text-xs text-status-successText">{t("tippspiel.tipp_gespeichert")}</p>
      )}
      {erreur && <p className="w-full text-xs text-status-dangerText">{erreur}</p>}
    </form>
  );
}

/**
 * Historique (retour utilisateur du 2026-10-11 : "vergangene Spiele und deren Tippergebnisse
 * verschwinden") — tout pronostic déjà enregistré dont la rencontre n'est plus ouverte à la
 * saisie (match passé, ou sous la date-limite d'un jour) reste visible en lecture seule, avec le
 * score réel (une fois joué) et les points attribués. `rencontre_infos` est fourni par l'API :
 * aucune dépendance à la pagination du calendrier.
 */
function HistoriqueTipps({ tipps }: { tipps: TippspielTip[] }) {
  const { t } = useTranslation("communaute");
  if (tipps.length === 0) return null;
  return (
    <section className="mt-6 space-y-2" data-testid="tippspiel-historie">
      <h4 className="text-sm font-bold text-text-primary">{t("tippspiel.historie_titel")}</h4>
      {tipps.map((tip) => {
        const r = tip.rencontre_infos;
        const gespielt = r.score_domicile !== null && r.score_exterieur !== null;
        return (
          <div
            key={tip.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-cid border border-text-tertiary/20 p-3"
          >
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-text-primary">
                <EquipeLogoImage
                  equipe={r.equipe_domicile}
                  className="h-6 w-6 shrink-0 object-contain"
                />
                <span className="truncate">
                  {r.equipe_domicile} — {r.equipe_exterieur}
                </span>
                <EquipeLogoImage
                  equipe={r.equipe_exterieur}
                  className="h-6 w-6 shrink-0 object-contain"
                />
              </div>
              <div className="text-xs text-text-tertiary">{formatDate(r.date_heure)}</div>
            </div>
            <dl className="flex items-center gap-4 text-xs">
              <div>
                <dt className="text-text-tertiary">{t("tippspiel.historie_ergebnis")}</dt>
                <dd className="font-bold tabular-nums text-text-primary">
                  {gespielt ? `${r.score_domicile} : ${r.score_exterieur}` : "–"}
                </dd>
              </div>
              <div>
                <dt className="text-text-tertiary">{t("tippspiel.historie_dein_tipp")}</dt>
                <dd className="font-bold tabular-nums text-text-primary">
                  {tip.score_domicile} : {tip.score_exterieur}
                </dd>
              </div>
              <div>
                <dt className="text-text-tertiary">{t("tippspiel.historie_punkte")}</dt>
                <dd className="font-bold tabular-nums text-text-primary">
                  {tip.points ?? t("tippspiel.historie_offen")}
                </dd>
              </div>
            </dl>
          </div>
        );
      })}
    </section>
  );
}

export default function TippspielTippAbgabe({ tippspielId }: { tippspielId: string }) {
  const { t } = useTranslation("communaute");
  const calendrierQuery = useCalendrierRencontres();
  const tippsQuery = useTippspielTipps({ tippspiel: tippspielId });

  const rencontres = useMemo(
    () => rencontresPronostiquables(calendrierQuery.data?.results ?? []),
    [calendrierQuery.data],
  );
  const tippsParRencontre = useMemo(() => {
    const carte = new Map<string, TippspielTip>();
    for (const tip of tippsQuery.data?.results ?? []) carte.set(tip.rencontre, tip);
    return carte;
  }, [tippsQuery.data]);

  const historie = useMemo(() => {
    const offene = new Set(rencontres.map((r) => r.id));
    return (tippsQuery.data?.results ?? [])
      .filter((tip) => !offene.has(tip.rencontre))
      .sort(
        (a, b) =>
          new Date(b.rencontre_infos.date_heure).getTime() -
          new Date(a.rencontre_infos.date_heure).getTime(),
      );
  }, [rencontres, tippsQuery.data]);

  if (calendrierQuery.isLoading || tippsQuery.isLoading) {
    return <p className="text-sm text-text-tertiary">{t("tippspiel.chargement")}</p>;
  }

  return (
    <div>
      {rencontres.length === 0 ? (
        <p className="text-sm text-text-tertiary">{t("tippspiel.tipps_leer")}</p>
      ) : (
        <div className="space-y-2">
          {rencontres.map((rencontre) => (
            <LigneTipp
              key={rencontre.id}
              tippspielId={tippspielId}
              rencontre={rencontre}
              tip={tippsParRencontre.get(rencontre.id)}
            />
          ))}
        </div>
      )}
      <HistoriqueTipps tipps={historie} />
    </div>
  );
}
