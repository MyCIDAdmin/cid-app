/**
 * Route publique /impressum (retour utilisateur du 2026-09-28, point 3.1) — nachbau de
 * https://www.mycid.org/impressum, voir docstring legalContent.ts.
 */
import { useTranslation } from "react-i18next";

import { IMPRESSUM } from "./legalContent";
import LegalPageLayout from "./LegalPageLayout";

export default function ImpressumPage() {
  const { i18n } = useTranslation();
  const langue = i18n.language?.toLowerCase().startsWith("de") ? "de" : "fr";
  return <LegalPageLayout contenu={IMPRESSUM[langue]} />;
}
