/**
 * Page "Fan-Club" (URL `/live`). Conteneur à onglets : "Tippspiel" (onglet par défaut),
 * "Tabelle", "Spielplan", "Statistiken". L'ancien onglet "Ticker" (liste des matchs du
 * Live-Ticker + création de match) a été retiré le 2026-10-30 (demande utilisateur : plus
 * utilisé). La page de détail d'un match (LiveMatchDetailPage, route /live/:id) et le
 * backend restent inchangés. Les onglets Tabelle/Spielplan/Statistiken affichent les
 * données Club Africain synchronisées automatiquement — en lecture seule.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import CalendrierTab from "../../components/communaute/CalendrierTab";
import ClassementTab from "../../components/communaute/ClassementTab";
import StatistiquesTab from "../../components/communaute/StatistiquesTab";
import TippspielSection from "../../components/communaute/TippspielSection";

type Onglet = "tippspiel" | "tabelle" | "spielplan" | "statistiken";

export default function LiveMatchPage() {
  const { t } = useTranslation("communaute");
  const [onglet, setOnglet] = useState<Onglet>("tippspiel");

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-text-primary">{t("live.titre")}</h1>
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto whitespace-nowrap border-b border-text-tertiary/20">
        {(["tippspiel", "tabelle", "spielplan", "statistiken"] as const).map((valeur) => (
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

      {onglet === "tippspiel" && <TippspielSection />}
      {onglet === "tabelle" && <ClassementTab />}
      {onglet === "spielplan" && <CalendrierTab />}
      {onglet === "statistiken" && <StatistiquesTab />}
    </div>
  );
}
