/** „Dein Stand“ : Platz im Tippspiel und Zahl der eigenen Reisen. Ohne Daten bleibt die Karte weg. */
import { useTranslation } from "react-i18next";

import { useTippspielTeilnahmen, useTippspiele } from "../../hooks/useCommunaute";
import { useModuleOuvert } from "../../hooks/useRbac";
import { useReisenListe } from "../../hooks/useReisen";

export default function DeinStand() {
  const { t } = useTranslation("dashboard");
  const liveOffen = useModuleOuvert("live").ouvert;
  const reisenOffen = useModuleOuvert("covoiturage").ouvert;
  const tippspiel = useTippspiele().data?.results.find((x) => x.statut === "publie");
  const meine = useTippspielTeilnahmen({ tippspiel: tippspiel?.id, mine: true }).data?.results[0];
  const rangliste = useTippspielTeilnahmen({ tippspiel: tippspiel?.id }).data?.results ?? [];
  const meineReisen = useReisenListe({ meine: true }, reisenOffen);

  const platz = meine ? rangliste.findIndex((x) => x.id === meine.id) + 1 : 0;
  const anzahlReisen = (meineReisen.data ?? []).filter(
    (r) => r.mein_status === "dabei" && !r.abgesagt,
  ).length;
  const zeigeTipp = liveOffen && platz > 0;
  if (!zeigeTipp && anzahlReisen === 0) return null;

  return (
    <section
      aria-label={t("uebersicht.stand.titel")}
      className="rounded-cid-lg bg-bg-primary p-4 shadow-sm"
      data-testid="dein-stand"
    >
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-secondary">
        {t("uebersicht.stand.titel")}
      </h2>
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-4">
        {zeigeTipp && meine && (
          <div>
            <dt className="text-xs text-text-secondary">{t("uebersicht.stand.tippspiel")}</dt>
            <dd className="text-2xl font-semibold tabular-nums text-text-primary">
              {t("uebersicht.stand.platz", { platz })}
            </dd>
            <dd className="text-xs text-text-secondary">
              {t("uebersicht.stand.von_punkte", {
                von: rangliste.length,
                punkte: meine.total_points,
              })}
            </dd>
          </div>
        )}
        {anzahlReisen > 0 && (
          <div>
            <dt className="text-xs text-text-secondary">{t("uebersicht.stand.reisen")}</dt>
            <dd className="text-2xl font-semibold tabular-nums text-text-primary">
              {anzahlReisen}
            </dd>
            <dd className="text-xs text-text-secondary">{t("uebersicht.stand.reisen_zeile")}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
