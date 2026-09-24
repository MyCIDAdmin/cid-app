/**
 * Onglet "Spielplan"/"Calendrier" — module Fan-Club (2026-09-24, extension du Live Match).
 * Lecture seule, synchronisé depuis GOAL API (voir backend apps.communaute.services) —
 * distinct des matchs du Live-Ticker (onglet "Ticker", voir LiveMatchPage.tsx). Calendrier
 * désormais COMPLET (toutes compétitions confondues), contrairement à SerpApi qui ne
 * renvoyait qu'une poignée de matchs — voir docstring de tête services.py.
 *
 * Badge "reportée"/"annulée" ajouté lors de la bascule GOAL API (2026-09-24) : `statut`
 * (`matchStatus` GOAL API) est désormais fiable pour toute rencontre, pas seulement
 * inféré depuis la présence d'un score.
 *
 * Ordre des rencontres (2026-09-24, correctif suite retour utilisateur "Es werden aber
 * alte Spiele von vorherigen Saisons dargestellt") : `useCalendrierRencontres()` ne
 * récupère qu'UNE page (PAGE_SIZE, voir settings/base.py) triée décroissant par
 * `date_heure` côté API (voir CalendrierCursorPagination dans views.py) — nécessaire
 * depuis que le calendrier synchronisé couvre tout l'historique disponible (198
 * rencontres, 2021 → saison en cours+à venir) : en ordre croissant, cette unique page ne
 * montrait jamais que les rencontres les plus anciennes. En décroissant, les rencontres à
 * venir (date future) arrivent systématiquement en tête ; on les réaffiche ensuite dans
 * l'ordre chronologique naturel (la plus proche en premier) via `.slice().reverse()` sur
 * le sous-ensemble déjà filtré — les résultats restent tels quels (le plus récent en
 * premier, déjà l'ordre attendu).
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

// Reportée/annulée : badge dédié plutôt qu'un résultat calculé — voir docstring de tête.
const CLE_LABEL_STATUT: Partial<Record<RencontreCalendrier["statut"], string>> = {
  POSTPONED: "live.calendrier_statut_reportee",
  CANCELLED: "live.calendrier_statut_annulee",
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
  const labelStatut = CLE_LABEL_STATUT[rencontre.statut];
  const resultat = labelStatut ? null : resultatClubAfricain(rencontre);

  return (
    <div className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-text-primary">
          {rencontre.equipe_domicile} — {rencontre.equipe_exterieur}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {labelStatut && (
            <span className="rounded-full bg-bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase text-text-tertiary">
              {t(labelStatut)}
            </span>
          )}
          {resultat && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${COULEUR_RESULTAT[resultat]}`}
            >
              {t(CLE_LABEL_RESULTAT[resultat])}
            </span>
          )}
          {aScore && !labelStatut && (
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
    // La page vient triée décroissant (voir docstring de tête) : les rencontres à venir
    // en sortent classées de la plus lointaine à la plus proche — inversé ici pour un
    // affichage chronologique naturel (prochain match en premier).
    const aVenirListe = rencontres.filter((r) => r.est_a_venir).slice().reverse();
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
