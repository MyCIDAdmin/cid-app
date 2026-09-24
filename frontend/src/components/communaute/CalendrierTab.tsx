/**
 * Onglet "Spielplan"/"Calendrier" — module Fan-Club (2026-09-24, extension du Live Match).
 * Lecture seule, synchronisé depuis TheSportsDB (voir backend apps.communaute.services) —
 * distinct des matchs du Live-Ticker (onglet "Ticker", voir LiveMatchPage.tsx).
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useCalendrierRencontres } from "../../hooks/useCommunaute";
import type { RencontreCalendrier } from "../../types/communaute";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function RencontreLigne({ rencontre }: { rencontre: RencontreCalendrier }) {
  const aScore = rencontre.score_domicile !== null && rencontre.score_exterieur !== null;
  return (
    <div className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-text-primary">
          {rencontre.equipe_domicile} — {rencontre.equipe_exterieur}
        </span>
        {aScore && (
          <span className="text-sm font-bold tabular-nums text-text-primary">
            {rencontre.score_domicile} : {rencontre.score_exterieur}
          </span>
        )}
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
