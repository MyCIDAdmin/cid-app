/**
 * Tests des 4 routes légales (retour utilisateur du 2026-09-28, points 3.1-3.4) — vérifie que
 * chaque page rend son titre et au moins une section attendue, en allemand (langue par défaut
 * des tests, voir renderWithProviders/i18n de test).
 */
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { renderWithProviders } from "../../../test/renderWithProviders";
import i18n from "../../../i18n";
import DatenschutzPage from "./DatenschutzPage";
import ErstattungsrichtliniePage from "./ErstattungsrichtliniePage";
import ImpressumPage from "./ImpressumPage";
import NutzungsbedingungenPage from "./NutzungsbedingungenPage";

describe("Pages légales", () => {
  // Contenu figé en dur par langue (pas de clés i18next, voir docstring legalContent.ts) — le
  // sélecteur de langue du composant lit `i18n.language`, qui vaut "fr" par défaut dans
  // l'environnement de test (fallbackLng, voir LanguageSwitcher.test.tsx) ; on le force ici sur
  // "de" pour vérifier le contenu allemand.
  beforeEach(() => {
    i18n.language = "de";
  });
  afterEach(() => {
    i18n.language = "fr";
  });

  it("Impressum affiche le titre et les informations de l'association", () => {
    renderWithProviders(<ImpressumPage />);
    expect(screen.getByText("Impressum")).toBeInTheDocument();
    expect(screen.getByText(/VR 39125 B/)).toBeInTheDocument();
    expect(screen.getAllByText(/Khaled Msakni/).length).toBeGreaterThan(0);
  });

  it("Datenschutz affiche le titre et les catégories de données", () => {
    renderWithProviders(<DatenschutzPage />);
    expect(screen.getByText("Datenschutzerklärung")).toBeInTheDocument();
    expect(screen.getByText(/Ihre Rechte nach der DSGVO/)).toBeInTheDocument();
  });

  it("Nutzungsbedingungen affiche le titre et la section Mitgliedschaft", () => {
    renderWithProviders(<NutzungsbedingungenPage />);
    expect(screen.getByText("Nutzungsbedingungen")).toBeInTheDocument();
    expect(screen.getByText("3. Mitgliedschaft")).toBeInTheDocument();
  });

  it("Erstattungsrichtlinie affiche le titre et la section Mitgliedsbeiträge", () => {
    renderWithProviders(<ErstattungsrichtliniePage />);
    expect(screen.getByText("Erstattungsrichtlinie")).toBeInTheDocument();
    expect(screen.getByText("2. Mitgliedsbeiträge")).toBeInTheDocument();
  });

  it("le lien de retour ramène vers la Startseite (\"/\")", () => {
    renderWithProviders(<ImpressumPage />);
    expect(screen.getByText("legal.retour").closest("a")).toHaveAttribute("href", "/");
  });
});
