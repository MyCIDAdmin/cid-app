/**
 * Kachel KPI animée — extraite/adaptée de la KpiTile locale (non exportée) de DashboardPage.tsx
 * pour être réutilisée dans les 4 onglets de Statistiken & KPIs (demande utilisateur du
 * 2026-09-25 : "dynamischer und bewegender Kacheln und Kennzahlen gestalten"). Même principe :
 * `useCountUp` anime uniquement les valeurs numériques (compteurs, pourcentages) — un montant
 * déjà formaté en chaîne (ex. "1 234,00 €") passe tel quel, sans animation, même convention que
 * KpiTile côté Dashboard (voir sa docstring : animer un montant en cours de calcul donnerait des
 * valeurs intermédiaires dénuées de sens).
 */
import { useCountUp } from "../../hooks/useCountUp";

export default function AnimatedKpiTile({
  label,
  value,
  suffix,
  accent = false,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  accent?: boolean;
}) {
  const valeurNumerique = typeof value === "number" ? value : undefined;
  const valeurAnimee = useCountUp(valeurNumerique);
  const texteValeur =
    typeof value === "number"
      ? `${Math.round(valeurAnimee ?? value).toLocaleString("de-DE")}${suffix ?? ""}`
      : value;

  return (
    <div
      className={`group rounded-cid-lg p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
        accent ? "bg-ca text-white" : "bg-bg-primary"
      }`}
    >
      <div className={`text-[10px] uppercase ${accent ? "text-white/70" : "text-text-tertiary"}`}>
        {label}
      </div>
      <div
        className={`text-lg font-bold tabular-nums ${accent ? "text-white" : "text-text-primary"}`}
      >
        {texteValeur}
      </div>
    </div>
  );
}
