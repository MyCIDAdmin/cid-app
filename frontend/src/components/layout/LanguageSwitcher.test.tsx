import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import i18n from "../../i18n";
import LanguageSwitcher from "./LanguageSwitcher";

// i18next-http-backend ne fait aucune requête réseau dans l'environnement de test (jsdom, pas
// de serveur Vite, voir DashboardPage.test.tsx) : un vrai `i18n.changeLanguage` y resterait donc
// bloqué en attente du chargement des namespaces. On remplace ici la méthode par un mock qui ne
// simule que l'effet observable qui nous intéresse (langue + événement "languageChanged", dont
// dépend react-i18next pour re-rendre les composants), sans déclencher le rechargement réseau
// réel — TS n'accepte pas `vi.spyOn(i18n, "changeLanguage")` (la méthode vient du mixin
// EventEmitter d'i18next, hors de l'union de clés que spyOn peut typer), d'où l'affectation
// directe plutôt qu'un spy.
describe("LanguageSwitcher", () => {
  const changeLanguageOriginal = i18n.changeLanguage.bind(i18n);
  let changeLanguageMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    i18n.language = "fr";
    changeLanguageMock = vi.fn((lng: string) => {
      i18n.language = lng;
      i18n.emit("languageChanged", lng);
      return Promise.resolve(i18n.t.bind(i18n));
    });
    i18n.changeLanguage = changeLanguageMock as typeof i18n.changeLanguage;
  });

  afterEach(() => {
    i18n.changeLanguage = changeLanguageOriginal;
    i18n.language = "fr";
  });

  it("met en évidence la langue actuelle (français)", () => {
    renderWithProviders(<LanguageSwitcher />);
    expect(screen.getByText("FR")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("DE")).toHaveAttribute("aria-pressed", "false");
  });

  it("change de langue au clic sur DE", () => {
    renderWithProviders(<LanguageSwitcher />);
    fireEvent.click(screen.getByText("DE"));
    expect(changeLanguageMock).toHaveBeenCalledWith("de");
    expect(screen.getByText("DE")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("FR")).toHaveAttribute("aria-pressed", "false");
  });
});
