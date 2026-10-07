/**
 * Setzt pro Route einen sprechenden Seitentitel (Browser-Tab, Verlauf, Lesezeichen, Screenreader)
 * und kündigt Seitenwechsel der SPA über eine Live-Region an (WCAG 2.4.2 / 4.1.3; Prüfung
 * 2026-10-07). Titel = Navigationsbezeichnung des passendsten Sidebar-Eintrags, sonst nur „CID“.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";

import { NAV_ITEMS } from "./Sidebar";

const MARKE = "CID";

function passenderEintrag(pfad: string) {
  return NAV_ITEMS.reduce<(typeof NAV_ITEMS)[number] | null>((best, item) => {
    const passt = pfad === item.to || (item.to !== "/" && pfad.startsWith(`${item.to}/`));
    return passt && (best === null || item.to.length > best.to.length) ? item : best;
  }, null);
}

export default function RouteAnnouncer() {
  const { t, i18n } = useTranslation("common");
  const { pathname } = useLocation();
  const [ansage, setAnsage] = useState("");

  useEffect(() => {
    const eintrag = passenderEintrag(pathname);
    const titel = eintrag ? `${t(eintrag.labelKey)} — ${MARKE}` : MARKE;
    document.title = titel;
    setAnsage(titel);
  }, [pathname, t, i18n.language]);

  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {ansage}
    </div>
  );
}
