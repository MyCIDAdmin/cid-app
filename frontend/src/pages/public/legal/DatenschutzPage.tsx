/**
 * Route publique /datenschutz (retour utilisateur du 2026-09-28, point 3.2) — nachbau de
 * https://www.mycid.org/privacy, voir docstring legalContent.ts.
 */
import { useTranslation } from "react-i18next";

import { DATENSCHUTZ } from "./legalContent";
import LegalPageLayout from "./LegalPageLayout";

export default function DatenschutzPage() {
  const { i18n } = useTranslation();
  const langue = i18n.language?.toLowerCase().startsWith("de") ? "de" : "fr";
  return <LegalPageLayout contenu={DATENSCHUTZ[langue]} />;
}
