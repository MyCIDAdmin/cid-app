/**
 * Bascule thème clair/sombre (topbar, demande utilisateur du 2026-09-16 — "Button zu Wechseln
 * zwischen Dunkel und Hell Modus"). L'état est persisté dans useUiStore (voir uiStore.ts), même
 * mécanisme que le repli de la sidebar ; c'est `toggleTheme` lui-même qui pose/retire la classe
 * `dark` sur <html> (Tailwind `darkMode: "class"`, voir tailwind.config.js/index.css) — ce
 * composant ne fait que déclencher l'action et afficher l'icône correspondant à l'état courant.
 */
import { IconMoon, IconSun } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

import { useUiStore } from "../../store/uiStore";

export default function ThemeToggle() {
  const { t } = useTranslation("common");
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);

  const label = t(theme === "dark" ? "action.mode_clair" : "action.mode_sombre");

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-full text-text-secondary hover:bg-bg-tertiary"
    >
      {theme === "dark" ? <IconSun size={18} /> : <IconMoon size={18} />}
    </button>
  );
}
