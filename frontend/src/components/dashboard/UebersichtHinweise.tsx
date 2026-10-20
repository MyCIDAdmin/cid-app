/**
 * Motivierende Hinweise im Modul „Übersicht“ (2026-10-20): bald stattfindende Veranstaltungen/
 * Aktionen, knappe Plätze, fast ausverkaufte Artikel. Auswahl, Reihenfolge und Höchstanzahl
 * bestimmt der Server (zentrale Einstellungen) ; hier entstehen nur Sätze und Verlinkung.
 */
import { IconFlame } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useHinweise } from "../../hooks/useZentral";
import type { Hinweis } from "../../types/zentral";

function textSchluessel(hinweis: Hinweis): string {
  const g = new Set(hinweis.gruende);
  if (hinweis.art === "artikel") {
    if (g.has("bestand") && g.has("frist")) return "artikel_bestand_frist";
    return g.has("bestand") ? "artikel_bestand" : "artikel_frist";
  }
  if (hinweis.art === "projekt") return "projekt_frist";
  // evenement / veranstaltung
  if (g.has("plaetze") && g.has("termin")) return "plaetze_termin";
  return g.has("plaetze") ? "plaetze" : "termin";
}

export default function UebersichtHinweise() {
  const { t } = useTranslation("dashboard");
  const { data } = useHinweise();
  const hinweise = data?.results ?? [];
  if (hinweise.length === 0) return null;

  function wann(tage: number | null): string {
    if (tage === null) return "";
    if (tage <= 0) return t("hinweise.wann_heute");
    if (tage === 1) return t("hinweise.wann_morgen");
    return t("hinweise.wann_tagen", { count: tage });
  }

  return (
    <section aria-label={t("hinweise.titel")} className="space-y-2">
      {hinweise.map((hinweis) => (
        <Link
          key={hinweis.id}
          to={hinweis.link}
          className="flex items-center gap-3 rounded-cid-lg bg-status-warningBg px-4 py-3 text-sm text-status-warningText shadow-sm transition-colors hover:brightness-95"
        >
          <IconFlame size={20} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            {t(`hinweise.${hinweis.art}.${textSchluessel(hinweis)}`, {
              titel: hinweis.titel,
              frei: hinweis.plaetze_frei ?? 0,
              gesamt: hinweis.plaetze_gesamt ?? 0,
              bestand: hinweis.bestand ?? 0,
              wann: wann(hinweis.tage),
              count: hinweis.plaetze_frei ?? hinweis.bestand ?? 0,
            })}
          </span>
          <span className="shrink-0 text-xs font-semibold underline">
            {t(`hinweise.aktion_${hinweis.art}`)}
          </span>
        </Link>
      ))}
    </section>
  );
}
