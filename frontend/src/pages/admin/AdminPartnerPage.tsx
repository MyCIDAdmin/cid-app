/**
 * Business Partner & Lieferanten (Nutzerwunsch 2026-10-07) — zwei Tabs: "Liste" (Pflege, Filter,
 * Import) und "Reporting" (alle Partner mit verknüpften Elementen, Umsatz, Details, Filter,
 * Excel-Export — Nutzerwunsch 2026-10-07, zweite Runde). Der Tab steht in `?tab=reporting`,
 * damit er verlinkbar ist. Lesen ab Rolle RH, Pflegen ab Bureau Admin (wie PartnerPermission).
 */
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import PartnerListeTab from "../../components/partner/PartnerListeTab";
import PartnerReportingTab from "../../components/partner/PartnerReportingTab";
import TabLeiste from "../../components/ui/TabLeiste";

export default function AdminPartnerPage() {
  const { t } = useTranslation("partner");
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "reporting" ? "reporting" : "liste";

  return (
    <div>
      <TabLeiste
        ariaLabel={t("titel")}
        aktiv={tab}
        onChange={(id) => setParams(id === "liste" ? {} : { tab: id }, { replace: true })}
        tabs={[
          { id: "liste", label: t("tab_liste") },
          { id: "reporting", label: t("tab_reporting") },
        ]}
      />
      {tab === "reporting" ? <PartnerReportingTab /> : <PartnerListeTab />}
    </div>
  );
}
