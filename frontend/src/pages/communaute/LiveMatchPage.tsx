/**
 * Page "Fan-Club" (URL `/live`). Conteneur à onglets : "Spieltag" (onglet par défaut, Fan-Club-Umbau
 * 2026-11), "Tippspiel", "Tabelle", "Spielplan", "Statistiken". L'ancien onglet "Ticker" (liste des matchs du
 * Live-Ticker + création de match) a été retiré le 2026-10-30 (demande utilisateur : plus
 * utilisé). La page de détail d'un match (LiveMatchDetailPage, route /live/:id) et le
 * backend restent inchangés. Les onglets Tabelle/Spielplan/Statistiken affichent les
 * données Club Africain synchronisées automatiquement — en lecture seule.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import CalendrierTab from "../../components/communaute/CalendrierTab";
import ClassementTab from "../../components/communaute/ClassementTab";
import StatistiquesTab from "../../components/communaute/StatistiquesTab";
import SpieltagTab from "../../components/communaute/SpieltagTab";
import TippspielSection from "../../components/communaute/TippspielSection";

type Onglet = "spieltag" | "tippspiel" | "tabelle" | "spielplan" | "statistiken";

const ONGLETS: Onglet[] = ["spieltag", "tippspiel", "tabelle", "spielplan", "statistiken"];

export default function LiveMatchPage() {
  const { t } = useTranslation("communaute");
  // `?tab=tippspiel` u. a. : Links aus Übersicht und Teilen-Funktion landen direkt im richtigen Reiter.
  const [params] = useSearchParams();
  const gewuenscht = params.get("tab") as Onglet | null;
  const [onglet, setOnglet] = useState<Onglet>(
    gewuenscht && ONGLETS.includes(gewuenscht) ? gewuenscht : "spieltag",
  );

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-text-primary">{t("live.titre")}</h1>
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto whitespace-nowrap border-b border-text-tertiary/20">
        {ONGLETS.map((valeur) => (
          <button
            key={valeur}
            type="button"
            onClick={() => setOnglet(valeur)}
            className={`px-3 py-2 text-sm font-medium ${
              onglet === valeur
                ? "border-b-2 border-ca text-ca"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            {t(`live.onglet_${valeur}`)}
          </button>
        ))}
      </div>

      {onglet === "spieltag" && <SpieltagTab onWechsel={setOnglet} />}
      {onglet === "tippspiel" && <TippspielSection />}
      {onglet === "tabelle" && <ClassementTab />}
      {onglet === "spielplan" && <CalendrierTab />}
      {onglet === "statistiken" && <StatistiquesTab />}
    </div>
  );
}
