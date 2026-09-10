import { useTranslation } from "react-i18next";

import { useAuthStore } from "../store/authStore";

export default function DashboardPage() {
  const { t } = useTranslation("common");
  const user = useAuthStore((s) => s.user);

  return (
    <div>
      <h1 className="text-xl font-bold text-text-primary">{t("dashboard.title")}</h1>
      <p className="mt-2 text-sm text-text-secondary">
        {t("dashboard.welcome", { email: user?.email })}
      </p>
      <p className="mt-4 text-sm text-text-tertiary">
        Ce tableau de bord sera enrichi des KPIs (FDD §3.6) au fil des prochaines phases
        d'implémentation.
      </p>
    </div>
  );
}
