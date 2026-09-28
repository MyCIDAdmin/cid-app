/**
 * Kachel "Nächstes Spiel" de l'onglet "Startseite" (retour utilisateur du 2026-09-28 :
 * "Nächstes-Spiel-Highlight-Kachel auf der Startseite") — met en avant la prochaine
 * rencontre à venir de Club Africain, entre le Hero et les Kennzahlen. Réutilise
 * `useCalendrierRencontres()` (même hook que CalendrierTab/FanClubPreview ci-dessous,
 * donc pas de nouvel appel réseau si l'onglet a déjà été affiché) plutôt qu'un nouvel
 * endpoint dédié : `CalendrierTab.tsx` calcule déjà côté client la liste `aVenir` triée
 * chronologiquement (la plus proche en premier) — le premier élément EST la prochaine
 * rencontre. Depuis le correctif "Spielplan-Filter (aktuelles+nächstes Jahr)"
 * (RencontreCalendrierViewSet.get_queryset(), 2026-09-28), cette liste ne contient plus
 * que l'année en cours + l'année suivante, donc toujours pertinente ici aussi.
 *
 * N'affiche rien (retourne null) tant qu'aucune rencontre à venir n'est connue (chargement,
 * erreur, ou calendrier vide) — pas de kachel vide/trompeuse sur la Startseite publique.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useCalendrierRencontres } from "../../hooks/useCommunaute";

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Nombre de jours calendaires (pas d'heures pleines) avant la rencontre — 0 = aujourd'hui,
// 1 = demain, etc. Négatif impossible ici : seules les rencontres `est_a_venir` sont prises
// en compte par l'appelant.
function joursAvant(iso: string): number {
  const maintenant = new Date();
  const debutAujourdhui = new Date(
    maintenant.getFullYear(),
    maintenant.getMonth(),
    maintenant.getDate()
  );
  const debutRencontre = new Date(iso);
  const debutJourRencontre = new Date(
    debutRencontre.getFullYear(),
    debutRencontre.getMonth(),
    debutRencontre.getDate()
  );
  return Math.round((debutJourRencontre.getTime() - debutAujourdhui.getTime()) / 86_400_000);
}

export default function NextMatchTile() {
  const { t, i18n } = useTranslation("public");
  const { data } = useCalendrierRencontres();

  const prochaineRencontre = useMemo(() => {
    const rencontres = data?.results ?? [];
    const aVenir = rencontres
      .filter((r) => r.est_a_venir)
      .slice()
      .sort((a, b) => new Date(a.date_heure).getTime() - new Date(b.date_heure).getTime());
    return aVenir[0] ?? null;
  }, [data]);

  if (!prochaineRencontre) return null;

  const jours = joursAvant(prochaineRencontre.date_heure);
  const labelDelai =
    jours === 0
      ? t("nextMatch.aujourdhui")
      : jours === 1
        ? t("nextMatch.demain")
        : t("nextMatch.dans_x_jours", { count: jours });

  return (
    <div className="flex flex-col gap-3 rounded-cid-lg bg-gradient-to-r from-ca to-cad p-5 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-white/75">
          {t("nextMatch.titre")}
        </div>
        <div className="mt-1 font-display text-lg font-bold sm:text-xl">
          {prochaineRencontre.equipe_domicile} — {prochaineRencontre.equipe_exterieur}
        </div>
        <div className="mt-1 text-sm text-white/85">
          {[prochaineRencontre.competition, formatDate(prochaineRencontre.date_heure, i18n.language)]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>
      <span className="inline-flex w-fit shrink-0 items-center rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
        {labelDelai}
      </span>
    </div>
  );
}
