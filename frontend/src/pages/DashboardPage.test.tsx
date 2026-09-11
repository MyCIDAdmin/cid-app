import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Les traductions ne sont pas chargées en environnement de test (pas de
// backend HTTP) — t() renvoie normalement la clé brute, ce qui empêche de
// vérifier QUELLE valeur est interpolée. On mock ici t() pour l'observer
// directement plutôt que de dépendre du texte affiché.
const tMock = vi.fn((key: string) => key);
vi.mock("react-i18next", async () => {
  const actual = await vi.importActual<typeof import("react-i18next")>("react-i18next");
  return { ...actual, useTranslation: () => ({ t: tMock }) };
});

import { useAuthStore } from "../store/authStore";
import DashboardPage from "./DashboardPage";

describe("DashboardPage", () => {
  beforeEach(() => {
    tMock.mockClear();
    useAuthStore.setState({ user: null });
  });

  it("affiche le titre du tableau de bord", () => {
    render(<DashboardPage />);
    expect(screen.getByRole("heading")).toBeInTheDocument();
  });

  it("passe le nom de famille à la traduction d'accueil, pas l'email (AHM-52)", () => {
    useAuthStore.setState({
      user: {
        id: "u1",
        email: "sami.bensalah@example.com",
        role: "membre",
        langue_preferee: "fr",
        prenom: "Sami",
        nom: "Ben Salah",
      },
    });

    render(<DashboardPage />);

    expect(tMock).toHaveBeenCalledWith("dashboard.welcome", { nom: "Ben Salah" });
  });

  it("retombe sur l'email si le compte n'a pas de fiche Membre liée", () => {
    useAuthStore.setState({
      user: {
        id: "u2",
        email: "admin@example.com",
        role: "bureau_admin",
        langue_preferee: "fr",
        prenom: "",
        nom: "",
      },
    });

    render(<DashboardPage />);

    expect(tMock).toHaveBeenCalledWith("dashboard.welcome", { nom: "admin@example.com" });
  });
});
