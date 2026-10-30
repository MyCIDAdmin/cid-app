/**
 * Onglet "Spielplan"/"Calendrier" — module Fan-Club (2026-09-24, extension du Live Match).
 * Lecture seule, synchronisé depuis GOAL API (voir backend apps.communaute.services) —
 * distinct des matchs du Live-Ticker (ancien onglet "Ticker", retiré le 2026-10-30, voir LiveMatchPage.tsx). Calendrier
 * désormais COMPLET (toutes compétitions confondues), contrairement à SerpApi qui ne
 * renvoyait qu'une poignée de matchs — voir docstring de tête services.py.
 *
 * Badge "reportée"/"annulée" ajouté lors de la bascule GOAL API (2026-09-24) : `statut`
 * (`matchStatus` GOAL API) est désormais fiable pour toute rencontre, pas seulement
 * inféré depuis la présence d'un score.
 *
 * Ordre des rencontres (2026-09-24, correctif suite retour utilisateur "Es werden aber
 * alte Spiele von vorherigen Saisons dargestellt") : côté API, triée décroissant par
 * `date_heure` (voir CalendrierCursorPagination dans views.py) — les rencontres à venir
 * (date future) arrivent systématiquement en tête ; on les réaffiche ensuite dans l'ordre
 * chronologique naturel (la plus proche en premier) via `.slice().reverse()` sur le
 * sous-ensemble déjà filtré — les résultats restent tels quels (le plus récent en
 * premier, déjà l'ordre attendu).
 *
 * Pagination (2026-09-24, second correctif suite retour utilisateur "Es sind nur die
 * Spiele der Hin Runde ... verfügbar") : `useCalendrierRencontres()` parcourt désormais
 * TOUTES les pages (voir listCalendrierRencontres côté api/communaute.ts), plus une
 * seule — le calendrier couvre toutes compétitions/saisons confondues (~200+ rencontres,
 * PAGE_SIZE=20) ; s'arrêter à la première page décroissante ne montrait que les
 * rencontres les PLUS lointaines dans le temps (ex. un match amical daté loin dans le
 * futur), jamais celles, pourtant plus proches, de la seconde moitié de saison en cours.
 *
 * Manuelle Korrekturen (2026-10-20, retour utilisateur) : Bureau Admin+ sieht pro Spiel
 * "Bearbeiten" (Datum/Uhrzeit, Ergebnis, Status) und oben "Spiel hinzufügen" — siehe
 * SpielplanEditForm. Gilt bis GOAL API einen abweichenden Stand liefert (dann überschreibt
 * die API die Korrektur, Backend services._appliquer_etat_api). Besucher und Mitglieder
 * sehen weiterhin nur die Daten (dieser Tab wird auch in der öffentlichen FanClubPreview
 * gerendert).
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useCalendrierRencontres } from "../../hooks/useCommunaute";
import { useReisenListe } from "../../hooks/useReisen";
import { hasRoleAtLeast, ROLE_LEVELS, useAuthStore } from "../../store/authStore";
import type { RencontreCalendrier } from "../../types/communaute";
import type { ReiseListItem } from "../../types/reisen";
import EquipeLogoImage from "./EquipeLogoImage";
import SpielplanEditForm from "./SpielplanEditForm";

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

function RencontreLigne({
  rencontre,
  peutEditer,
  reisen = [],
  reisenMoeglich = false,
}: {
  rencontre: RencontreCalendrier;
  peutEditer: boolean;
  /** Reisen zu diesem Spiel, die der Nutzer sehen darf (Reise-Modul). */
  reisen?: ReiseListItem[];
  /** Angemeldet und Spiel steht noch aus: "Reise organisieren" anbieten. */
  reisenMoeglich?: boolean;
}) {
  const { t } = useTranslation("communaute");
  const [edition, setEdition] = useState(false);
  const aScore = rencontre.score_domicile !== null && rencontre.score_exterieur !== null;
  const labelStatut = CLE_LABEL_STATUT[rencontre.statut];
  const resultat = labelStatut ? null : resultatClubAfricain(rencontre);

  return (
    <div className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-text-primary">
          <EquipeLogoImage equipe={rencontre.equipe_domicile} />
          <span className="truncate">
            {rencontre.equipe_domicile} — {rencontre.equipe_exterieur}
          </span>
          <EquipeLogoImage equipe={rencontre.equipe_exterieur} />
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
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-text-tertiary">
        <span>
          {[rencontre.competition, formatDate(rencontre.date_heure)].filter(Boolean).join(" · ")}
        </span>
        {peutEditer && rencontre.ajout_manuel && (
          <span className="rounded-full bg-bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase">
            {t("live.calendrier_badge_manuel")}
          </span>
        )}
        {peutEditer && !rencontre.ajout_manuel && rencontre.modifie_manuellement && (
          <span className="rounded-full bg-bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase">
            {t("live.calendrier_badge_korrigiert")}
          </span>
        )}
        {peutEditer && !edition && (
          <button
            type="button"
            onClick={() => setEdition(true)}
            className="ml-auto rounded-cid px-2 py-0.5 text-[11px] font-medium text-ca hover:bg-cal"
          >
            {t("live.calendrier_bearbeiten")}
          </button>
        )}
      </div>
      {(reisen.length > 0 ||
        (reisenMoeglich && rencontre.equipe_exterieur === "Club Africain")) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {reisen.map((r) => (
            <Link key={r.id} to={`/reisen/${r.id}`} className="font-medium text-ca hover:underline">
              {t("live.calendrier_reise_oeffnen", { titel: r.titel })}
            </Link>
          ))}
          {reisenMoeglich && rencontre.equipe_exterieur === "Club Africain" && (
            <Link
              to={`/reisen/neu?rencontre=${rencontre.id}`}
              className="font-medium text-ca hover:underline"
            >
              {t("live.calendrier_reise_organisieren")}
            </Link>
          )}
        </div>
      )}
      {edition && <SpielplanEditForm rencontre={rencontre} onClose={() => setEdition(false)} />}
    </div>
  );
}

export default function CalendrierTab() {
  const { t } = useTranslation("communaute");
  const { data, isLoading, isError } = useCalendrierRencontres();
  const user = useAuthStore((state) => state.user);
  const peutEditer = hasRoleAtLeast(user, ROLE_LEVELS.bureau_admin);
  const [ajoutOuvert, setAjoutOuvert] = useState(false);
  const { data: reisenListe } = useReisenListe({}, Boolean(user));
  const reisenProSpiel = useMemo(() => {
    const m = new Map<string, ReiseListItem[]>();
    for (const r of reisenListe ?? []) {
      if (r.rencontre && !r.abgesagt) m.set(r.rencontre, [...(m.get(r.rencontre) ?? []), r]);
    }
    return m;
  }, [reisenListe]);
  const rencontres = useMemo(() => data?.results ?? [], [data]);

  const { aVenir, resultats } = useMemo(() => {
    // La page vient triée décroissant (voir docstring de tête) : les rencontres à venir
    // en sortent classées de la plus lointaine à la plus proche — inversé ici pour un
    // affichage chronologique naturel (prochain match en premier).
    const aVenirListe = rencontres
      .filter((r) => r.est_a_venir)
      .slice()
      .reverse();
    const resultatsListe = rencontres.filter((r) => !r.est_a_venir);
    return { aVenir: aVenirListe, resultats: resultatsListe };
  }, [rencontres]);

  if (isLoading) {
    return <p className="text-sm text-text-tertiary">{t("live.calendrier_chargement")}</p>;
  }
  if (isError) {
    return <p className="text-sm text-status-dangerText">{t("live.calendrier_erreur")}</p>;
  }
  const ajout = peutEditer && (
    <div>
      {ajoutOuvert ? (
        <SpielplanEditForm rencontre={null} onClose={() => setAjoutOuvert(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setAjoutOuvert(true)}
          className="rounded-cid bg-ca px-3 py-1.5 text-xs font-medium text-white hover:bg-cad"
        >
          {t("live.calendrier_hinzufuegen")}
        </button>
      )}
    </div>
  );

  if (rencontres.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-text-tertiary">{t("live.calendrier_vide")}</p>
        {ajout}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {ajout}
      <div>
        <h2 className="mb-2 text-xs font-bold uppercase text-text-tertiary">
          {t("live.calendrier_a_venir")}
        </h2>
        <div className="space-y-2">
          {aVenir.map((rencontre) => (
            <RencontreLigne
              key={rencontre.id}
              rencontre={rencontre}
              peutEditer={peutEditer}
              reisen={reisenProSpiel.get(rencontre.id)}
              reisenMoeglich={Boolean(user)}
            />
          ))}
        </div>
      </div>
      <div>
        <h2 className="mb-2 text-xs font-bold uppercase text-text-tertiary">
          {t("live.calendrier_resultats")}
        </h2>
        <div className="space-y-2">
          {resultats.map((rencontre) => (
            <RencontreLigne key={rencontre.id} rencontre={rencontre} peutEditer={peutEditer} />
          ))}
        </div>
      </div>
    </div>
  );
}
