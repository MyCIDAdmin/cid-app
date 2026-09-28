/**
 * Route publique /erstattungsrichtlinie (retour utilisateur du 2026-09-28, point 3.4) —
 * nachbau de https://www.mycid.org/refund-policy, voir docstring legalContent.ts.
 */
import { useTranslation } from "react-i18next";

import { ERSTATTUNG } from "./legalContent";
import LegalPageLayout from "./LegalPageLayout";

export default function ErstattungsrichtliniePage() {
  const { i18n } = useTranslation();
  const langue = i18n.language?.toLowerCase().startsWith("de") ? "de" : "fr";
  return <LegalPageLayout contenu={ERSTATTUNG[langue]} />;
}
