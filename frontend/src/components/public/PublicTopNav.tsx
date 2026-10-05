/**
 * Barre de navigation horizontale de la page d'accueil publique (mockup https://www.mycid.org/,
 * demande utilisateur du 2026-09-26, plan "Öffentliche mycid.org-Startseite" section B) —
 * réservée aux visiteurs/membres non-actifs (voir HomeRoute.tsx) : un membre actif ne la voit
 * jamais, sa navigation se fait via la Sidebar (décision utilisateur, "Die horizontale Bar ist
 * für Besucher und nicht Mitglieder gedacht").
 *
 * Onglets pilotés par `?onglet=` (voir PublicHomePage.tsx) plutôt que des routes dédiées, même
 * principe que BoutiquePage/ProjetsPage/LiveMatchPage — évite toute collision avec les routes
 * authentifiées existantes (/evenements, /projets, /boutique, /albums).
 */
import { IconMoon, IconSun } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useUiStore } from "../../store/uiStore";
import BrandLogo from "../ui/BrandLogo";
import LanguageSwitcher from "../layout/LanguageSwitcher";

/** Onglets de la page d'accueil publique (voir PublicHomePage.tsx, qui importe ce type d'ici
 * plutôt que l'inverse pour éviter tout import circulaire entre les deux fichiers). */
export type OngletPublic =
  | "accueil"
  | "evenements"
  | "projets"
  | "shop"
  | "galerie"
  | "apropos";

const ONGLETS: { value: OngletPublic; labelKey: string }[] = [
  { value: "accueil", labelKey: "nav.accueil" },
  { value: "evenements", labelKey: "nav.evenements" },
  { value: "projets", labelKey: "nav.projets" },
  { value: "shop", labelKey: "nav.shop" },
  { value: "galerie", labelKey: "nav.galerie" },
  { value: "apropos", labelKey: "nav.apropos" },
];

interface PublicTopNavProps {
  onglet: OngletPublic;
  onChangeOnglet: (cible: OngletPublic) => void;
}

export default function PublicTopNav({ onglet, onChangeOnglet }: PublicTopNavProps) {
  const { t } = useTranslation("public");
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const [menuMobileOuvert, setMenuMobileOuvert] = useState(false);

  return (
    <header className="glass-bar sticky top-0 z-20 border-b border-text-tertiary/10 bg-bg-primary">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={() => onChangeOnglet("accueil")}
          className="flex shrink-0 items-center gap-2"
        >
          <BrandLogo className="h-9 w-9" />
          <span className="hidden font-display text-sm font-semibold uppercase tracking-wide text-text-primary sm:inline">
            Clubistes in Deutschland
          </span>
        </button>

        <nav className="hidden flex-1 items-center gap-1 lg:flex" aria-label={t("nav.aria_label")}>
          {ONGLETS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => onChangeOnglet(item.value)}
              className={`rounded-cid px-3 py-2 text-sm font-medium transition ${
                onglet === item.value
                  ? "bg-cal text-ca"
                  : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
              }`}
            >
              {t(item.labelKey)}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <LanguageSwitcher />
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={t(theme === "dark" ? "action.mode_clair" : "action.mode_sombre")}
            title={t(theme === "dark" ? "action.mode_clair" : "action.mode_sombre")}
            className="flex h-9 w-9 items-center justify-center rounded-full text-text-secondary hover:bg-bg-tertiary"
          >
            {theme === "dark" ? <IconSun size={18} /> : <IconMoon size={18} />}
          </button>
          <Link
            to="/login"
            className="hidden whitespace-nowrap rounded-cid bg-ca px-4 py-2 text-sm font-semibold text-white transition hover:bg-cad sm:inline-block"
          >
            {t("action.connexion")}
          </Link>
          <button
            type="button"
            onClick={() => setMenuMobileOuvert((v) => !v)}
            aria-label={t("nav.aria_label")}
            aria-expanded={menuMobileOuvert}
            className="rounded-cid p-2 text-text-secondary hover:bg-bg-tertiary lg:hidden"
          >
            <span className="block h-0.5 w-5 bg-current" />
            <span className="mt-1 block h-0.5 w-5 bg-current" />
            <span className="mt-1 block h-0.5 w-5 bg-current" />
          </button>
        </div>
      </div>

      {menuMobileOuvert && (
        <nav
          className="flex flex-col gap-1 border-t border-text-tertiary/10 px-4 py-3 lg:hidden"
          aria-label={t("nav.aria_label")}
        >
          {ONGLETS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => {
                onChangeOnglet(item.value);
                setMenuMobileOuvert(false);
              }}
              className={`rounded-cid px-3 py-2 text-left text-sm font-medium ${
                onglet === item.value ? "bg-cal text-ca" : "text-text-secondary"
              }`}
            >
              {t(item.labelKey)}
            </button>
          ))}
          <Link
            to="/login"
            className="mt-1 rounded-cid bg-ca px-4 py-2 text-center text-sm font-semibold text-white"
          >
            {t("action.connexion")}
          </Link>
        </nav>
      )}
    </header>
  );
}
