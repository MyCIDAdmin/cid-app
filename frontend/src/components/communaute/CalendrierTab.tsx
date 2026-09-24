/**
 * Onglet "Spielplan"/"Calendrier" — module Fan-Club (2026-09-24, extension du Live Match).
 * Lecture seule, synchronisé depuis SerpApi/Google Sports (voir backend apps.communaute.services) —
 * distinct des matchs du Live-Ticker (onglet "Ticker", voir LiveMatchPage.tsx).
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useCalendrierRencontres } from "../../hooks/useCommunaute";
import type { RencontreCalendrier } from "../../types/communaute";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

type Resultat = "sieg" | "niederlage" | "unentschieden";

const COULEUR_RESULTAT: Record<Resultat, string> = {
  sieg: "bg-status-successBg text-status-successText",
  niederlage: "bg-status-dangerBg text-status-dangerText",
  unentschieden: "bg-bg-secondary text-text-tertiary",
};

const CLE_LABEL_RESULTAT: Record<Resultat, string> = {
  sieg: "live.calendrier_resultat_sieg",
  niederlage: "live.calendrier_resultat_niederlage",
  unentschieden: "live.calendrier_resultat_unentschieden",
};

// Issue du match du point de vue de Club Africain (voir services.py — score renseigné
// uniquement pour les rencontres déjà jouées, retournées par la requête "<ligue> results" :
// couvre TOUTE la ligue, pas seulement Club Africain, d'où le null explicite quand l'équipe
// n'apparaît pas dans cette rencontre, ex. "Ben Guerdane — CS Hammam-Lif").
function resultatClubAfricain(rencontre: RencontreCalendrier): Resultat | null {
  if (rencontre.score_domicile === null || rencontre.score_exterieur === null) return null;
  const estDomicile = rencontre.equipe_domicile === "Club Africain";
  const estExterieur = rencontre.equipe_exterieur === "Club Africain";
  if (!estDomicile && !estExterieur) return null;

  const scoreCa = estDomicile ? rencontre.score_domicile : rencontre.score_exterieur;
  const scoreAdversaire = estDomicile ? rencontre.score_exterieur : rencontre.score_domicile;
  if (scoreCa > scoreAdversaire) return "sieg";
  if (scoreCa < scoreAdversaire) return "niederlage";
  return "unentschieden";
}

function RencontreLigne({ rencontre }: { rencontre: RencontreCalendrier }) {
  const { t } = useTranslation("communaute");
  const aScore = rencontre.score_domicile !== null && rencontre.score_exterieur !== null;
  const resultat = resultatClubAfricain(rencontre);

  return (
    <div className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-text-primary">
          {rencontre.equipe_domicile} — {rencontre.equipe_exterieur}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {resultat && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${COULEUR_RESULTAT[resultat]}`}
            >
              {t(CLE_LABEL_RESULTAT[resultat])}
            </span>
          )}
          {aScore && (
            <span className="text-sm font-bold tabular-nums text-text-primary">
              {rencontre.score_domicile} : {rencontre.score_exterieur}
            </span>
          )}
        </div>
      </div>
      <div className="mt-0.5 text-xs text-text-tertiary">
        {[rencontre.competition, formatDate(rencontre.date_heure)].filter(Boolean).join(" · ")}
      </div>
    </div>
  );
}

export default function CalendrierTab() {
  const { t } = useTranslation("communaute");
  const { data, isLoading, isError } = useCalendrierRencontres();
  const rencontres = useMemo(() => data?.results ?? [], [data]);

  const { aVenir, resultats } = useMemo(() => {
    const aVenirListe = rencontres.filter((r) => r.est_a_venir);
    const resultatsListe = rencontres.filter((r) => !r.est_a_venir);
    return { aVenir: aVenirListe, resultats: resultatsListe };
  }, [rencontres]);

  if (isLoading) {
    return <p className="text-sm text-text-tertiary">{t("live.calendrier_chargement")}</p>;
  }
  if (isError) {
    return <p className="text-sm text-status-dangerText">{t("live.calendrier_erreur")}</p>;
  }
  if (rencontres.length === 0) {
    return <p className="text-sm text-text-tertiary">{t("live.calendrier_vide")}</p>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="mb-2 text-xs font-bold uppercase text-text-tertiary">
          {t("live.calendrier_a_venir")}
        </h2>
        <div className="space-y-2">
          {aVenir.map((rencontre) => (
            <RencontreLigne key={rencontre.id} rencontre={rencontre} />
          ))}
        </div>
      </div>
      <div>
        <h2 className="mb-2 text-xs font-bold uppercase text-text-tertiary">
          {t("live.calendrier_resultats")}
        </h2>
        <div className="space-y-2">
          {resultats.map((rencontre) => (
            <RencontreLigne key={rencontre.id} rencontre={rencontre} />
          ))}
        </div>
      </div>
    </div>
  );
}
