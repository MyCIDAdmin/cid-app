import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useMembresHooks from "../../hooks/useMembres";
import * as useVoteHooks from "../../hooks/useVote";
import { useAuthStore } from "../../store/authStore";
import CreerVoteWizardPage from "./CreerVoteWizardPage";

vi.mock("../../hooks/useVote", async () => {
  const actual = await vi.importActual<typeof useVoteHooks>("../../hooks/useVote");
  return { ...actual, useCreerVoteSession: vi.fn() };
});

vi.mock("../../hooks/useMembres", async () => {
  const actual = await vi.importActual<typeof useMembresHooks>("../../hooks/useMembres");
  return { ...actual, useMembresList: vi.fn() };
});

const bureauAdmin = {
  id: "u2",
  email: "admin@example.com",
  role: "bureau_admin" as const,
  langue_preferee: "fr" as const,
};

const dirFinancier = { ...bureauAdmin, id: "u3", email: "df@example.com", role: "dir_financier" as const };

describe("CreerVoteWizardPage", () => {
  let mutate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mutate = vi.fn();
    vi.mocked(useVoteHooks.useCreerVoteSession).mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useVoteHooks.useCreerVoteSession>);
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: bureauAdmin,
      isAuthenticated: true,
    });
    vi.mocked(useMembresHooks.useMembresList).mockReturnValue({
      data: {
        count: 2,
        next: null,
        previous: null,
        results: [
          { id: "m1", prenom: "Khaled", nom: "Test", ville_de: "Berlin" },
          { id: "m2", prenom: "Abir", nom: "Test", ville_de: "Munich" },
        ],
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useMembresHooks.useMembresList>);
  });

  it("redirige un rôle non autorisé (Directeur Financier, malgré un niveau numérique supérieur)", () => {
    useAuthStore.setState({ user: dirFinancier });
    renderWithProviders(<CreerVoteWizardPage />, { route: "/votes/creer", path: "/votes/creer" });
    expect(screen.getByTestId("route-fallback")).toBeInTheDocument();
  });

  it("bloque le passage à l'étape 2 tant que le titre/la description ne sont pas remplis", () => {
    renderWithProviders(<CreerVoteWizardPage />);
    fireEvent.click(screen.getByText("wizard.suivant"));
    expect(screen.getByText("wizard.erreur_titre_requis")).toBeInTheDocument();
    expect(screen.getByText("wizard.etape_parametres")).toBeInTheDocument();
  });

  it("seed 3 options fixes (Oui/Non/Abstention) pour un vote oui_non, non modifiables", () => {
    renderWithProviders(<CreerVoteWizardPage />);
    fireEvent.change(screen.getByPlaceholderText("wizard.titre_placeholder"), {
      target: { value: "Adoption de la charte" },
    });
    fireEvent.change(screen.getByPlaceholderText("wizard.description_placeholder"), {
      target: { value: "Approuvez-vous la nouvelle charte ?" },
    });
    fireEvent.change(screen.getByDisplayValue("wizard.type_unique"), {
      target: { value: "oui_non" },
    });
    fireEvent.click(screen.getByText("wizard.suivant"));

    const champs = screen.getAllByDisplayValue(/^(Oui|Non|Abstention)$/) as HTMLInputElement[];
    expect(champs.map((c) => c.value)).toEqual(["Oui", "Non", "Abstention"]);
    champs.forEach((c) => expect(c).toBeDisabled());
  });

  it("mène les 3 étapes jusqu'au POST de création avec le payload attendu", () => {
    renderWithProviders(<CreerVoteWizardPage />);

    fireEvent.change(screen.getByPlaceholderText("wizard.titre_placeholder"), {
      target: { value: "Élection du Bureau" },
    });
    fireEvent.change(screen.getByPlaceholderText("wizard.description_placeholder"), {
      target: { value: "Élisez le nouveau bureau." },
    });
    fireEvent.click(screen.getByText("wizard.suivant"));

    const optionInputs = screen.getAllByPlaceholderText(/wizard.option_placeholder/);
    fireEvent.change(optionInputs[0], { target: { value: "Candidat A" } });
    fireEvent.change(optionInputs[1], { target: { value: "Candidat B" } });
    fireEvent.click(screen.getByText("wizard.suivant"));

    fireEvent.click(screen.getByText("wizard.lancer"));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        titre: "Élection du Bureau",
        description: "Élisez le nouveau bureau.",
        type_vote: "unique",
        options: [{ label: "Candidat A" }, { label: "Candidat B" }],
      }),
      expect.anything(),
    );
  });

  it("permet de cibler un groupe précis de membres (sélection manuelle)", () => {
    renderWithProviders(<CreerVoteWizardPage />);

    fireEvent.change(screen.getByPlaceholderText("wizard.titre_placeholder"), {
      target: { value: "Commission RGPD" },
    });
    fireEvent.change(screen.getByPlaceholderText("wizard.description_placeholder"), {
      target: { value: "Vote réservé à la commission." },
    });
    fireEvent.change(screen.getByDisplayValue("wizard.eligibilite_tous_actifs"), {
      target: { value: "selection_manuelle" },
    });

    // Le groupe est vide : passer à l'étape suivante doit être bloqué.
    fireEvent.click(screen.getByText("wizard.suivant"));
    expect(screen.getByText("wizard.erreur_membres_requis")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Khaled Test", { exact: false }));
    fireEvent.click(screen.getByText("Abir Test", { exact: false }));
    fireEvent.click(screen.getByText("wizard.suivant"));

    const optionInputs = screen.getAllByPlaceholderText(/wizard.option_placeholder/);
    fireEvent.change(optionInputs[0], { target: { value: "Candidat A" } });
    fireEvent.change(optionInputs[1], { target: { value: "Candidat B" } });
    fireEvent.click(screen.getByText("wizard.suivant"));
    fireEvent.click(screen.getByText("wizard.lancer"));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        eligibilite: "selection_manuelle",
        membres_selectionnes: ["m1", "m2"],
      }),
      expect.anything(),
    );
  });
});
