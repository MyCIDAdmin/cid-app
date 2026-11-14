/**
 * Modul "Mitglieder": Tab "Verzeichnis" (bisherige Mitgliederliste) und — ab Rolle RH — Tab
 * "Reporting" (Mitgliederliste mit Historie, alle Aktivitäten, Filter, Excel-Export; Nutzerwunsch
 * 2026-10-07). Der Tab steht in `?tab=reporting`. Das Backend schützt das Reporting zusätzlich
 * (IsRHOrAbove) ; Rollen unterhalb RH sehen nur das Verzeichnis ohne Tab-Leiste.
 */
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import FaehigkeitenReportingTab from "../../components/membres/FaehigkeitenReportingTab";
import MembreReportingTab from "../../components/membres/MembreReportingTab";
import TabLeiste from "../../components/ui/TabLeiste";
import MembresListPage from "./MembresListPage";
import { usePageAccess } from "../../hooks/useRbac";

export default function MembresPage() {
  const { t } = useTranslation("membres");
  const peutBerichten = usePageAccess("page_membres").accessible;
  const [params, setParams] = useSearchParams();
  const roh = params.get("tab");
  const tab =
    peutBerichten && (roh === "reporting" || roh === "faehigkeiten") ? roh : "verzeichnis";

  if (!peutBerichten) return <MembresListPage />;
  return (
    <div>
      <TabLeiste
        ariaLabel={t("liste.titre")}
        aktiv={tab}
        onChange={(id) => setParams(id === "verzeichnis" ? {} : { tab: id }, { replace: true })}
        tabs={[
          { id: "verzeichnis", label: t("tab_verzeichnis") },
          { id: "reporting", label: t("tab_reporting") },
          { id: "faehigkeiten", label: t("tab_faehigkeiten") },
        ]}
      />
      {tab === "reporting" && <MembreReportingTab />}
      {tab === "faehigkeiten" && <FaehigkeitenReportingTab />}
      {tab === "verzeichnis" && <MembresListPage />}
    </div>
  );
}
