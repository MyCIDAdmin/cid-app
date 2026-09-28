/**
 * Pied de page repris de https://www.mycid.org/ (demande utilisateur du 2026-09-26, point
 * 2.1.7) — affiché en bas de la page d'accueil publique ET, décision utilisateur ("Auch in der
 * eingeloggten App"), en bas de toute page appartenant aux groupes Sidebar "Allgemein",
 * "Community" et "Inhalte" (jamais "Administration") — voir AppLayout.tsx et
 * Sidebar.tsx::getGroupForPath.
 *
 * Les liens Rechtliches (Impressum/Datenschutz/Nutzungsbedingungen/Erstattungsrichtlinie)
 * pointent depuis le 2026-09-28 (retour utilisateur, points 3.1-3.4) vers des routes internes
 * (/impressum, /datenschutz, /nutzungsbedingungen, /erstattungsrichtlinie — voir
 * pages/public/legal/) qui reconstruisent le contenu des pages mycid.org/{impressum,privacy,
 * terms,refund-policy} correspondantes, au lieu de liens externes vers mycid.org.
 *
 * Variante `compact` (retour utilisateur du 2026-09-27 : "Der Footer in der App nach Anmeldung
 * ist zu groß, nimmt einen großen Platz [...] Footer soll immer am Ende der Seite angebunden
 * sein") : à l'origine réservée à AppLayout.tsx, également utilisée par PublicHomePage.tsx depuis
 * le 2026-09-28 (retour utilisateur : "Den dünnen Footer aus den Seiten der Modulen in die
 * Startseite übernehmen") — la grille 3 colonnes py-10 d'origine (ci-dessous, `compact=false`)
 * n'est plus utilisée qu'en repli si un futur écran en a besoin. Une seule ligne dense (marque +
 * liens légaux + contact + réseaux sociaux) plutôt que la grille 3 colonnes — le contenu reste
 * strictement le même (aucun lien retiré), seule la densité change.
 */
import { IconBrandFacebook, IconBrandInstagram, IconMail, IconMapPin } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import BrandLogo from "../ui/BrandLogo";

// Lien "location" du footer (retour utilisateur du 2026-09-27) — pointe directement vers le lien
// Google Maps fourni par l'utilisateur ; inutile de le résoudre côté serveur/scraping, un lien
// externe n'a besoin que de sa cible, pas de son contenu.
const LIEN_LOCALISATION = "https://share.google/2bOef3rWXOlAMprNM";

// Routes internes (voir pages/public/legal/) depuis le 2026-09-28 — remplacent les anciens liens
// externes vers mycid.org (voir docstring de tête).
const LIENS_LEGAUX = [
  { labelKey: "footer.impressum", href: "/impressum" },
  { labelKey: "footer.datenschutz", href: "/datenschutz" },
  { labelKey: "footer.agb", href: "/nutzungsbedingungen" },
  { labelKey: "footer.erstattung", href: "/erstattungsrichtlinie" },
];

const LIENS_SOCIAUX = [
  {
    labelKey: "footer.facebook",
    href: "https://www.facebook.com/people/%D8%AE%D9%84%D9%8A%D8%A9-%D8%A3%D8%AD%D8%A8%D8%A7%D8%A1-%D8%A7%D9%84%D9%86%D8%A7%D8%AF%D9%8A-%D8%A7%D9%84%D8%A7%D9%81%D8%B1%D9%8A%D9%82%D9%8A-%D8%A8%D8%A3%D9%84%D9%85%D8%A7%D9%86%D9%8A%D8%A7/100052125737170/",
  },
  { labelKey: "footer.instagram", href: "https://www.instagram.com/clubistes_in_deutschland/" },
];

export default function PublicFooter({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation("public");

  if (compact) {
    return (
      <footer className="shrink-0 border-t border-text-tertiary/10 bg-bg-primary">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 text-xs sm:px-6">
          <div className="flex items-center gap-1.5">
            <BrandLogo className="h-5 w-5" />
            <span className="font-display font-semibold uppercase tracking-wide text-text-primary">
              MyCID
            </span>
            <span className="text-text-tertiary">{t("footer.depuis_2019")}</span>
          </div>

          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {LIENS_LEGAUX.map((lien) => (
              <li key={lien.labelKey}>
                <Link to={lien.href} className="text-text-secondary hover:text-ca">
                  {t(lien.labelKey)}
                </Link>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <a
              href="mailto:info@clubistesindeutschland.org"
              className="flex items-center gap-1 text-text-secondary hover:text-ca"
            >
              <IconMail size={14} className="shrink-0" />
              info@clubistesindeutschland.org
            </a>
            <a
              href={LIEN_LOCALISATION}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-text-secondary hover:text-ca"
            >
              <IconMapPin size={14} className="shrink-0" />
              {t("footer.pays")}
            </a>
            {LIENS_SOCIAUX.map((lien) => (
              <a
                key={lien.labelKey}
                href={lien.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t(lien.labelKey)}
                className="flex items-center text-text-secondary hover:text-ca"
              >
                {lien.labelKey === "footer.facebook" ? (
                  <IconBrandFacebook size={16} className="shrink-0" />
                ) : (
                  <IconBrandInstagram size={16} className="shrink-0" />
                )}
              </a>
            ))}
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className="border-t border-text-tertiary/10 bg-bg-primary">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-3">
        <div>
          <div className="flex items-center gap-2">
            <BrandLogo className="h-8 w-8" />
            <p className="font-display text-sm font-semibold uppercase tracking-wide text-text-primary">
              MyCID <span className="text-text-tertiary">{t("footer.depuis_2019")}</span>
            </p>
          </div>
          <p className="mt-2 max-w-sm text-sm text-text-secondary">{t("footer.claim")}</p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            {t("footer.rechtliches_titre")}
          </p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {LIENS_LEGAUX.map((lien) => (
              <li key={lien.labelKey}>
                <Link to={lien.href} className="text-text-secondary hover:text-ca">
                  {t(lien.labelKey)}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            {t("footer.kontakt_titre")}
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-text-secondary">
            <li>
              <a
                href="mailto:info@clubistesindeutschland.org"
                className="flex items-center gap-1.5 hover:text-ca"
              >
                <IconMail size={16} className="shrink-0" />
                info@clubistesindeutschland.org
              </a>
            </li>
            <li>
              <a
                href={LIEN_LOCALISATION}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 hover:text-ca"
              >
                <IconMapPin size={16} className="shrink-0" />
                {t("footer.pays")}
              </a>
            </li>
          </ul>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            {t("footer.folgen_titre")}
          </p>
          <ul className="mt-2 flex gap-3 text-sm">
            {LIENS_SOCIAUX.map((lien) => (
              <li key={lien.labelKey}>
                <a
                  href={lien.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-text-secondary hover:text-ca"
                >
                  {lien.labelKey === "footer.facebook" ? (
                    <IconBrandFacebook size={16} className="shrink-0" />
                  ) : (
                    <IconBrandInstagram size={16} className="shrink-0" />
                  )}
                  {t(lien.labelKey)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
