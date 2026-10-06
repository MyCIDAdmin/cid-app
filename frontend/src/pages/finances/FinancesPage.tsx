/**
 * Page "Finanzen" (2026-10-06) — saisie des dépenses avec validation à quatre yeux, budget
 * annuel par catégorie, catégories configurables. Alimente la Jahresbilanz du module
 * "Statistiken & KPIs". Accès : page de gestion `page_finances` (matrice RBAC).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { usePageAccess } from "../../hooks/useRbac";
import AbschlussTab from "../../components/finances/AbschlussTab";
import BudgetTab from "../../components/finances/BudgetTab";
import CategoriesTab from "../../components/finances/CategoriesTab";
import DepensesTab from "../../components/finances/DepensesTab";
import ProtokollTab from "../../components/finances/ProtokollTab";
import PruefungTab from "../../components/finances/PruefungTab";

type Onglet = "depenses" | "budget" | "categories" | "protokoll" | "pruefung" | "abschluss";

export default function FinancesPage() {
  const { t } = useTranslation("finances");
  const [onglet, setOnglet] = useState<Onglet>("depenses");
  const { modifiable } = usePageAccess("page_finances");

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-text-primary">{t("titre")}</h1>
      <p className="mb-4 text-xs text-text-tertiary">{t("vier_augen")}</p>
      <div className="mb-4 flex gap-1 overflow-x-auto whitespace-nowrap border-b border-text-tertiary/20">
        {(["depenses", "budget", "categories", "pruefung", "protokoll", "abschluss"] as const).map(
          (o) => (
            <button
              key={o}
              type="button"
              onClick={() => setOnglet(o)}
              className={`px-3 py-2 text-sm font-medium ${
                onglet === o
                  ? "border-b-2 border-ca text-ca"
                  : "text-text-tertiary hover:text-text-secondary"
              }`}
            >
              {t(`onglets.${o}`)}
            </button>
          ),
        )}
      </div>
      {onglet === "depenses" && <DepensesTab modifiable={modifiable} />}
      {onglet === "budget" && <BudgetTab modifiable={modifiable} />}
      {onglet === "categories" && <CategoriesTab modifiable={modifiable} />}
      {onglet === "pruefung" && <PruefungTab />}
      {onglet === "protokoll" && <ProtokollTab />}
      {onglet === "abschluss" && <AbschlussTab modifiable={modifiable} />}
    </div>
  );
}
