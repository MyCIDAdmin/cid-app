/** Schnellzugriffe der Übersicht : die häufigsten Wege, je nach geöffneten Modulen. */
import { IconCreditCard, IconHelp, IconPlane, IconTicket, IconTrophy } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useModuleOuvert } from "../../hooks/useRbac";

export default function Schnellzugriffe() {
  const { t } = useTranslation("dashboard");
  const live = useModuleOuvert("live").ouvert;
  const reisen = useModuleOuvert("covoiturage").ouvert;
  const eintraege = [
    live && { to: "/live", icon: IconTrophy, text: t("uebersicht.schnell.tippen") },
    reisen && { to: "/reisen", icon: IconPlane, text: t("uebersicht.schnell.reise") },
    { to: "/tickets", icon: IconTicket, text: t("uebersicht.schnell.tickets") },
    { to: "/mon-adhesion", icon: IconCreditCard, text: t("uebersicht.schnell.beitrag") },
    { to: "/support", icon: IconHelp, text: t("uebersicht.schnell.hilfe") },
  ].filter((e): e is { to: string; icon: typeof IconTrophy; text: string } => Boolean(e));
  return (
    <nav
      aria-label={t("uebersicht.schnell.titel")}
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible"
    >
      {eintraege.map(({ to, icon: Symbol, text }) => (
        <Link
          key={to}
          to={to}
          className="inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full bg-bg-primary px-4 text-sm font-semibold text-text-primary shadow-sm transition-colors hover:text-ca"
        >
          <Symbol size={18} className="text-ca" aria-hidden="true" />
          {text}
        </Link>
      ))}
    </nav>
  );
}
