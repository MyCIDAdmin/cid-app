import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import * as useMembresHooks from "../../hooks/useMembres";
import { useAuthStore } from "../../store/authStore";
import type { Conversation } from "../../types/communaute";
import MessageriePage from "./MessageriePage";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return { ...actual, useConversations: vi.fn(), useCreerConversation: vi.fn() };
});

vi.mock("../../hooks/useMembres", async () => {
  const actual = await vi.importActual<typeof useMembresHooks>("../../hooks/useMembres");
  return { ...actual, useMembresList: vi.fn() };
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

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "c1",
    autre_participant: { id: "m2", prenom: "Lina", nom: "Khemiri", photo: null },
    dernier_message: null,
    nombre_non_lus: 0,
    created_at: "2026-01-01T10:00:00Z",
    ...overrides,
  };
}

function mutationMock<T>(): T {
  return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false } as unknown as T;
}

describe("MessageriePage", () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: membre,
      isAuthenticated: true,
    });
    vi.mocked(useCommunauteHooks.useCreerConversation).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useCreerConversation>>(),
    );
    vi.mocked(useMembresHooks.useMembresList).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useMembresHooks.useMembresList>);
  });

  it("affiche la liste des conversations avec le nom de l'autre participant", () => {
    vi.mocked(useCommunauteHooks.useConversations).mockReturnValue({
      data: page([conversation()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useConversations>);

    renderWithProviders(<MessageriePage />);

    expect(screen.getByText("Lina Khemiri")).toBeInTheDocument();
  });

  it("affiche un badge de non-lus", () => {
    vi.mocked(useCommunauteHooks.useConversations).mockReturnValue({
      data: page([conversation({ nombre_non_lus: 3 })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useConversations>);

    renderWithProviders(<MessageriePage />);

    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("affiche un message si aucune conversation", () => {
    vi.mocked(useCommunauteHooks.useConversations).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useConversations>);

    renderWithProviders(<MessageriePage />);

    expect(screen.getByText("messagerie.aucune_conversation")).toBeInTheDocument();
  });

  it("recherche un membre et démarre une conversation", () => {
    vi.mocked(useCommunauteHooks.useConversations).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useConversations>);
    vi.mocked(useMembresHooks.useMembresList).mockReturnValue({
      data: page([{ id: "m3", prenom: "Hamza", nom: "Meddeb" }]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useMembresHooks.useMembresList>);
    const creer = mutationMock<ReturnType<typeof useCommunauteHooks.useCreerConversation>>();
    vi.mocked(useCommunauteHooks.useCreerConversation).mockReturnValue(creer);

    renderWithProviders(<MessageriePage />);

    fireEvent.change(screen.getByPlaceholderText("messagerie.rechercher_membre"), {
      target: { value: "Hamza" },
    });
    fireEvent.click(screen.getByText("Hamza Meddeb"));

    expect(creer.mutate).toHaveBeenCalledWith("m3", expect.anything());
  });
});
