/**
 * Gabarit commun aux 4 pages légales (Impressum/Datenschutz/Nutzungsbedingungen/
 * Erstattungsrichtlinie, voir legalContent.ts) — routes autonomes (pas des onglets
 * PublicHomePage, voir App.tsx) car elles doivent rester accessibles depuis le footer
 * affiché aussi bien sur la Startseite publique QUE dans l'app connectée (AppLayout.tsx,
 * `afficherFooter`). Toujours publiques (pas de RequireAuth) : un visiteur anonyme doit
 * pouvoir les lire sans se connecter, exactement comme sur mycid.org.
 *
 * En-tête volontairement minimal (logo + retour) plutôt que le PublicTopNav complet à
 * onglets : ces pages sont des destinations ponctuelles consultées depuis n'importe quel
 * contexte (footer public OU footer de l'app connectée), pas des vues de la Startseite —
 * PublicTopNav est couplé à son état `?onglet=` (voir docstring PublicTopNav.tsx) et n'a
 * pas de sens ici.
 */
import { IconArrowLeft } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import LanguageSwitcher from "../../../components/layout/LanguageSwitcher";
import PublicFooter from "../../../components/public/PublicFooter";
import BrandLogo from "../../../components/ui/BrandLogo";
import type { PageLegale } from "./legalContent";

function Abschnitt({ titre, absaetze, liste }: PageLegale["sections"][number]) {
  return (
    <section>
      {titre && (
        <h2 className="mb-2 text-base font-bold text-text-primary">{titre}</h2>
      )}
      {absaetze?.map((p) => (
        <p key={p.slice(0, 40)} className="mb-2 text-sm leading-relaxed text-text-secondary">
          {p}
        </p>
      ))}
      {liste && (
        <ul className="mb-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-text-secondary">
          {liste.map((item) => (
            <li key={item.slice(0, 40)}>{item}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function LegalPageLayout({ contenu }: { contenu: PageLegale }) {
  const { t } = useTranslation("public");

  return (
    <div className="flex min-h-screen flex-col bg-bg-tertiary">
      <header className="border-b border-text-tertiary/10 bg-bg-primary">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <BrandLogo className="h-7 w-7" />
            <span className="font-display text-sm font-semibold uppercase tracking-wide text-text-primary">
              MyCID
            </span>
          </Link>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
          <Link
            to="/"
            className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-ca hover:underline"
          >
            <IconArrowLeft size={14} />
            {t("legal.retour")}
          </Link>

          <h1 className="text-xl font-bold text-text-primary">{contenu.titre}</h1>
          <p className="mt-1 text-sm text-text-tertiary">{contenu.untertitel}</p>

          <div className="mt-6 space-y-6 rounded-cid-lg bg-bg-primary p-4 shadow-card sm:p-6">
            {contenu.sections.map((section, index) => (
              // Certains titres sont volontairement vides (paragraphe de suite, voir
              // legalContent.ts) : l'index de section est la seule clé stable disponible ici,
              // la liste de sections elle-même n'étant jamais réordonnée/filtrée dynamiquement.
              <Abschnitt key={`section-${index}`} {...section} />
            ))}
          </div>

          <p className="mt-4 text-xs text-text-tertiary">{contenu.stand}</p>
        </div>
      </main>

      <PublicFooter compact />
    </div>
  );
}
