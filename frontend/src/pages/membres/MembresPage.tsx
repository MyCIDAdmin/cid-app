/**
 * Modul "Mitglieder": Tab "Verzeichnis" (bisherige Mitgliederliste) und — ab Rolle RH — Tab
 * "Reporting" (Mitgliederliste mit Historie, alle Aktivitäten, Filter, Excel-Export; Nutzerwunsch
 * 2026-10-07). Der Tab steht in `?tab=reporting`. Das Backend schützt das Reporting zusätzlich
 * (IsRHOrAbove) ; Rollen unterhalb RH sehen nur das Verzeichnis ohne Tab-Leiste.
 */
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import MembreReportingTab from "../../components/membres/MembreReportingTab";
import TabLeiste from "../../components/ui/TabLeiste";
import { hasRoleAtLeast, ROLE_LEVELS, useAuthStore } from "../../store/authStore";
import MembresListPage from "./MembresListPage";

export default function MembresPage() {
  const { t } = useTranslation("membres");
  const peutBerichten = hasRoleAtLeast(
    useAuthStore((s) => s.user),
    ROLE_LEVELS.rh,
  );
  const [params, setParams] = useSearchParams();
  const tab = peutBerichten && params.get("tab") === "reporting" ? "reporting" : "verzeichnis";

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
        ]}
      />
      {tab === "reporting" ? <MembreReportingTab /> : <MembresListPage />}
    </div>
  );
}
