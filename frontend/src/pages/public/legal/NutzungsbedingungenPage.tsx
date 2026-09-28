/**
 * Route publique /nutzungsbedingungen (retour utilisateur du 2026-09-28, point 3.3) —
 * nachbau de https://www.mycid.org/terms, voir docstring legalContent.ts.
 */
import { useTranslation } from "react-i18next";

import { AGB } from "./legalContent";
import LegalPageLayout from "./LegalPageLayout";

export default function NutzungsbedingungenPage() {
  const { i18n } = useTranslation();
  const langue = i18n.language?.toLowerCase().startsWith("de") ? "de" : "fr";
  return <LegalPageLayout contenu={AGB[langue]} />;
}
