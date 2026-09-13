/**
 * Configuration i18n (TDD §1, SDD §4) — namespaces chargés à la demande,
 * détection automatique de langue, support RTL pour l'arabe (Release 2).
 */
import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import Backend from "i18next-http-backend";
import { initReactI18next } from "react-i18next";

export const SUPPORTED_LANGUAGES = ["fr", "de", "ar"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const RTL_LANGUAGES: SupportedLanguage[] = ["ar"];

i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "fr",
    supportedLngs: SUPPORTED_LANGUAGES,
    ns: [
      "common",
      "auth",
      "membres",
      "cotisations",
      "inscriptions",
      "adhesions",
      "boutique",
      "stats",
      "notifications",
      "vote",
      "communaute",
    ],
    defaultNS: "common",
    backend: {
      loadPath: "/locales/{{lng}}/{{ns}}.json",
    },
    detection: {
      order: ["localStorage", "navigator", "htmlTag"],
      caches: ["localStorage"],
    },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

export function applyDirection(lng: string) {
  const dir = RTL_LANGUAGES.includes(lng as SupportedLanguage) ? "rtl" : "ltr";
  document.documentElement.dir = dir;
  document.documentElement.lang = lng;
}

i18n.on("languageChanged", applyDirection);

export default i18n;
