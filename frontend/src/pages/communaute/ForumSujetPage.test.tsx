import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import { useAuthStore } from "../../store/authStore";
import type { Sujet } from "../../types/communaute";
import ForumSujetPage from "./ForumSujetPage";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return {
    ...actual,
    useSujet: vi.fn(),
    useEpinglerSujet: vi.fn(),
    useVerrouillerSujet: vi.fn(),
    useMasquerSujet: vi.fn(),
    useSupprimerSujet: vi.fn(),
    useRepondreAuSujet: vi.fn(),
    useSupprimerReponseForum: vi.fn(),
    useMasquerReponseForum: vi.fn(),
  };
});

const membre = {
  id: "u1",
  email: "membre@example.com",
  role: "membre" as const,
  langue_preferee: "fr" as const,
};

const bureauAdmin = { ...membre, id: "u2", role: "bureau_admin" as const };

const auteurA = { id: "m1", prenom: "Lina", nom: "Khemiri", photo: null };

function sujet(overrides: Partial<Sujet> = {}): Sujet {
  return {
    id: "s1",
    auteur: auteurA,
    categorie: "general",
    titre: "Discussion générale",
    contenu: "Contenu du sujet.",
    est_epingle: false,
    est_verrouille: false,
    est_masque: false,
    motif_masquage: "",
    created_at: "2026-01-01T10:00:00Z",
    updated_at: "2026-01-01T10:00:00Z",
    nombre_reponses: 0,
    reponses: [],
    est_auteur: false,
    ...overrides,
  };
}

function mutationMock<T>(): T {
  return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false } as unknown as T;
}

function renderSujet() {
  return renderWithProviders(<ForumSujetPage />, { route: "/forum/s1", path: "/forum/:id" });
}

describe("ForumSujetPage", () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: membre,
      isAuthenticated: true,
    });
    vi.mocked(useCommunauteHooks.useEpinglerSujet).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useEpinglerSujet>>(),
    );
    vi.mocked(useCommunauteHooks.useVerrouillerSujet).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useVerrouillerSujet>>(),
    );
    vi.mocked(useCommunauteHooks.useMasquerSujet).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useMasquerSujet>>(),
    );
    vi.mocked(useCommunauteHooks.useSupprimerSujet).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useSupprimerSujet>>(),
    );
    vi.mocked(useCommunauteHooks.useRepondreAuSujet).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useRepondreAuSujet>>(),
    );
    vi.mocked(useCommunauteHooks.useSupprimerReponseForum).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useSupprimerReponseForum>>(),
    );
    vi.mocked(useCommunauteHooks.useMasquerReponseForum).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useMasquerReponseForum>>(),
    );
  });

  it("affiche le sujet et ses réponses", () => {
    vi.mocked(useCommunauteHooks.useSujet).mockReturnValue({
      data: sujet({
        reponses: [
          {
            id: "r1",
            sujet: "s1",
            auteur: auteurA,
            contenu: "Une réponse",
            est_masquee: false,
            created_at: "2026-01-01T11:00:00Z",
            est_auteur: false,
          },
        ],
      }),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useSujet>);

    renderSujet();

    expect(screen.getByText("Discussion générale")).toBeInTheDocument();
    expect(screen.getByText("Une réponse")).toBeInTheDocument();
  });

  it("affiche le bouton de partage externe du sujet", () => {
    // Retour utilisateur du 2026-09-29, module "Forum" : "Es soll möglich sein Elemente in
    // Social Media zu teilen" — voir ShareButton.tsx et son docstring.
    vi.mocked(useCommunauteHooks.useSujet).mockReturnValue({
      data: sujet(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useSujet>);

    renderSujet();

    expect(screen.getByLabelText("partage.bouton_aria")).toBeInTheDocument();
  });

  it("un membre normal ne voit pas les actions de modération", () => {
    vi.mocked(useCommunauteHooks.useSujet).mockReturnValue({
      data: sujet(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useSujet>);

    renderSujet();

    expect(screen.queryByText("forum.epingler")).not.toBeInTheDocument();
    expect(screen.queryByText("forum.verrouiller")).not.toBeInTheDocument();
  });

  it("un bureau admin voit et peut utiliser les actions de modération", () => {
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: bureauAdmin,
      isAuthenticated: true,
    });
    const epingler = mutationMock<ReturnType<typeof useCommunauteHooks.useEpinglerSujet>>();
    vi.mocked(useCommunauteHooks.useEpinglerSujet).mockReturnValue(epingler);
    vi.mocked(useCommunauteHooks.useSujet).mockReturnValue({
      data: sujet(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useSujet>);

    renderSujet();

    fireEvent.click(screen.getByText("forum.epingler"));
    expect(epingler.mutate).toHaveBeenCalledWith("s1");
  });

  it("un sujet verrouillé masque le formulaire de réponse", () => {
    vi.mocked(useCommunauteHooks.useSujet).mockReturnValue({
      data: sujet({ est_verrouille: true }),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useSujet>);

    renderSujet();

    expect(screen.getByText("forum.sujet_verrouille_message")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("forum.placeholder_reponse")).not.toBeInTheDocument();
  });

  it("soumet une réponse au sujet", () => {
    const repondre = mutationMock<ReturnType<typeof useCommunauteHooks.useRepondreAuSujet>>();
    vi.mocked(useCommunauteHooks.useRepondreAuSujet).mockReturnValue(repondre);
    vi.mocked(useCommunauteHooks.useSujet).mockReturnValue({
      data: sujet(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useSujet>);

    renderSujet();

    fireEvent.change(screen.getByPlaceholderText("forum.placeholder_reponse"), {
      target: { value: "Ma réponse" },
    });
    fireEvent.click(screen.getByText("forum.repondre"));

    expect(repondre.mutate).toHaveBeenCalledWith(
      { sujetId: "s1", contenu: "Ma réponse" },
      expect.anything(),
    );
  });
});
