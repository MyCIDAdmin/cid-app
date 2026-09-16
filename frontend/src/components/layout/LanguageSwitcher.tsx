/**
 * Sélecteur de langue FR/DE (topbar, demande utilisateur du 2026-09-16 — "Die App soll auf
 * Deutsch und Französisch sein"). L'arabe existe déjà dans SUPPORTED_LANGUAGES (voir i18n.ts,
 * RTL préparé pour une phase ultérieure du FDD) mais n'a ni contenu traduit ni demande
 * explicite ici : volontairement absent de ce sélecteur pour l'instant.
 *
 * i18next-browser-languagedetector (voir i18n.ts) ne fait que pré-remplir la langue au tout
 * premier chargement (détection navigateur) ; ce composant permet ensuite un choix manuel
 * explicite. `i18n.changeLanguage` déclenche déjà l'événement "languageChanged" écouté par
 * `applyDirection` (i18n.ts, gère le RTL) et persiste lui-même le choix dans localStorage
 * (detection.caches, voir i18n.ts) — inutile de dupliquer cette persistance dans useUiStore.
 */
import { useTranslation } from "react-i18next";

const LANGUES = [
  { code: "fr", label: "FR", labelKey: "langue.francais" },
  { code: "de", label: "DE", labelKey: "langue.allemand" },
] as const;

export default function LanguageSwitcher() {
  const { t, i18n } = useTranslation("common");
  const langueActuelle = i18n.language?.toLowerCase().startsWith("de") ? "de" : "fr";

  return (
    <div className="flex items-center gap-0.5 rounded-full border border-text-tertiary/20 p-0.5">
      {LANGUES.map((langue) => (
        <button
          key={langue.code}
          type="button"
          onClick={() => i18n.changeLanguage(langue.code)}
          aria-pressed={langueActuelle === langue.code}
          aria-label={t(langue.labelKey)}
          title={t(langue.labelKey)}
          className={`rounded-full px-2 py-1 text-xs font-semibold transition ${
            langueActuelle === langue.code
              ? "bg-ca text-white"
              : "text-text-secondary hover:bg-bg-tertiary"
          }`}
        >
          {langue.label}
        </button>
      ))}
    </div>
  );
}
