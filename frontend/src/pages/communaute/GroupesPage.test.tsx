import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import { useAuthStore } from "../../store/authStore";
import type { GroupeChat } from "../../types/communaute";
import GroupesPage from "./GroupesPage";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return {
    ...actual,
    useGroupes: vi.fn(),
    useCreerGroupe: vi.fn(),
    useRejoindreGroupe: vi.fn(),
    useRechercherMembres: vi.fn(),
  };
});

const membre = {
  id: "u1",
  email: "membre@example.com",
  role: "membre" as const,
  langue_preferee: "fr" as const,
};

function page<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

function groupe(overrides: Partial<GroupeChat> = {}): GroupeChat {
  return {
    id: "g1",
    nom: "Supporters Berlin",
    description: "Groupe des supporters à Berlin.",
    type_groupe: "public",
    createur: { id: "m1", prenom: "Sana", nom: "Werfelli", photo: null },
    created_at: "2026-01-01T10:00:00Z",
    nombre_membres: 5,
    est_membre: false,
    ...overrides,
  };
}

function mutationMock<T>(): T {
  return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false } as unknown as T;
}

describe("GroupesPage", () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: membre,
      isAuthenticated: true,
    });
    vi.mocked(useCommunauteHooks.useCreerGroupe).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useCreerGroupe>>(),
    );
    vi.mocked(useCommunauteHooks.useRejoindreGroupe).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useRejoindreGroupe>>(),
    );
    vi.mocked(useCommunauteHooks.useRechercherMembres).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useRechercherMembres>);
  });

  it("affiche la liste des groupes", () => {
    vi.mocked(useCommunauteHooks.useGroupes).mockReturnValue({
      data: page([groupe()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useGroupes>);

    renderWithProviders(<GroupesPage />);

    expect(screen.getByText("Supporters Berlin")).toBeInTheDocument();
  });

  it("affiche un message si aucun groupe", () => {
    vi.mocked(useCommunauteHooks.useGroupes).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useGroupes>);

    renderWithProviders(<GroupesPage />);

    expect(screen.getByText("groupes.aucun_groupe")).toBeInTheDocument();
  });

  it("propose 'Rejoindre' pour un groupe dont on n'est pas encore membre", () => {
    vi.mocked(useCommunauteHooks.useGroupes).mockReturnValue({
      data: page([groupe({ est_membre: false })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useGroupes>);

    renderWithProviders(<GroupesPage />);

    expect(screen.getByText("groupes.rejoindre")).toBeInTheDocument();
  });

  it("propose 'Ouvrir' pour un groupe dont on est déjà membre", () => {
    vi.mocked(useCommunauteHooks.useGroupes).mockReturnValue({
      data: page([groupe({ est_membre: true })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useGroupes>);

    renderWithProviders(<GroupesPage />);

    expect(screen.getByText("groupes.ouvrir")).toBeInTheDocument();
  });

  it("crée un groupe public", () => {
    const creer = mutationMock<ReturnType<typeof useCommunauteHooks.useCreerGroupe>>();
    vi.mocked(useCommunauteHooks.useCreerGroupe).mockReturnValue(creer);
    vi.mocked(useCommunauteHooks.useGroupes).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useGroupes>);

    renderWithProviders(<GroupesPage />);

    fireEvent.click(screen.getByText("groupes.nouveau_groupe"));
    fireEvent.change(screen.getByPlaceholderText("groupes.nom_placeholder"), {
      target: { value: "Nouveau groupe" },
    });
    fireEvent.click(screen.getByText("groupes.creer"));

    expect(creer.mutate).toHaveBeenCalledWith(
      { nom: "Nouveau groupe", description: "", type_groupe: "public", membres_invites: undefined },
      expect.anything(),
    );
  });

  it("recherche un membre à inviter (via l'annuaire communaute, pas apps/membres) pour un groupe privé", () => {
    vi.mocked(useCommunauteHooks.useGroupes).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useGroupes>);
    vi.mocked(useCommunauteHooks.useRechercherMembres).mockReturnValue({
      data: [{ id: "m3", prenom: "Hamza", nom: "Meddeb", photo: null }],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useRechercherMembres>);

    renderWithProviders(<GroupesPage />);

    fireEvent.click(screen.getByText("groupes.nouveau_groupe"));
    fireEvent.click(screen.getByText("groupes.type_prive"));
    fireEvent.change(screen.getByPlaceholderText("groupes.inviter_membres"), {
      target: { value: "Hamza" },
    });

    expect(screen.getByText("Hamza Meddeb")).toBeInTheDocument();
  });

  it("affiche une liste de membres parcourable dès que 'privé' est choisi, sans avoir tapé de recherche", () => {
    vi.mocked(useCommunauteHooks.useGroupes).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useGroupes>);
    vi.mocked(useCommunauteHooks.useRechercherMembres).mockReturnValue({
      data: [{ id: "m3", prenom: "Hamza", nom: "Meddeb", photo: null }],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useRechercherMembres>);

    renderWithProviders(<GroupesPage />);

    fireEvent.click(screen.getByText("groupes.nouveau_groupe"));
    fireEvent.click(screen.getByText("groupes.type_prive"));

    expect(screen.getByText("Hamza Meddeb")).toBeInTheDocument();
  });
});
