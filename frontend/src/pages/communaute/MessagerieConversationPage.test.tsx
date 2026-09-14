import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import * as useMessagerieSocketHook from "../../hooks/useMessagerieSocket";
import { useAuthStore } from "../../store/authStore";
import MessagerieConversationPage from "./MessagerieConversationPage";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return { ...actual, useMessagesPrives: vi.fn() };
});

vi.mock("../../hooks/useMessagerieSocket", () => ({ useMessagerieSocket: vi.fn() }));

const membre = {
  id: "u1",
  email: "membre@example.com",
  role: "membre" as const,
  langue_preferee: "fr" as const,
};

function page<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

function renderConversation() {
  return renderWithProviders(<MessagerieConversationPage />, {
    route: "/messagerie/c1",
    path: "/messagerie/:id",
  });
}

describe("MessagerieConversationPage", () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: membre,
      isAuthenticated: true,
    });
    vi.mocked(useCommunauteHooks.useMessagesPrives).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useMessagesPrives>);
  });

  it("affiche l'historique des messages", () => {
    vi.mocked(useCommunauteHooks.useMessagesPrives).mockReturnValue({
      data: page([
        {
          id: "m1",
          conversation: "c1",
          expediteur: "u2",
          contenu: "Salut !",
          est_lu: true,
          lu_le: null,
          created_at: "2026-01-01T10:00:00Z",
          est_expediteur: false,
        },
      ]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useMessagesPrives>);
    vi.mocked(useMessagerieSocketHook.useMessagerieSocket).mockReturnValue({
      statut: "ouvert",
      messages: [],
      erreur: null,
      envoyer: vi.fn(),
      marquerLu: vi.fn(),
    });

    renderConversation();

    expect(screen.getByText("Salut !")).toBeInTheDocument();
  });

  it("envoie un message via le WebSocket", () => {
    const envoyer = vi.fn();
    vi.mocked(useMessagerieSocketHook.useMessagerieSocket).mockReturnValue({
      statut: "ouvert",
      messages: [],
      erreur: null,
      envoyer,
      marquerLu: vi.fn(),
    });

    renderConversation();

    fireEvent.change(screen.getByPlaceholderText("messagerie.placeholder_message"), {
      target: { value: "Coucou" },
    });
    fireEvent.click(screen.getByText("messagerie.envoyer"));

    expect(envoyer).toHaveBeenCalledWith("Coucou");
  });

  it("désactive le formulaire tant que la connexion n'est pas ouverte", () => {
    vi.mocked(useMessagerieSocketHook.useMessagerieSocket).mockReturnValue({
      statut: "connexion",
      messages: [],
      erreur: null,
      envoyer: vi.fn(),
      marquerLu: vi.fn(),
    });

    renderConversation();

    expect(screen.getByPlaceholderText("messagerie.placeholder_message")).toBeDisabled();
  });

  it("affiche une erreur du socket", () => {
    vi.mocked(useMessagerieSocketHook.useMessagerieSocket).mockReturnValue({
      statut: "ouvert",
      messages: [],
      erreur: "Connexion à la messagerie perdue — veuillez réessayer dans un instant.",
      envoyer: vi.fn(),
      marquerLu: vi.fn(),
    });

    renderConversation();

    expect(
      screen.getByText("Connexion à la messagerie perdue — veuillez réessayer dans un instant."),
    ).toBeInTheDocument();
  });
});
