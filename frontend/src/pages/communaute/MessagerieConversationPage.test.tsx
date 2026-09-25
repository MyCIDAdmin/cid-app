import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import * as useMessagerieSocketHook from "../../hooks/useMessagerieSocket";
import { useAuthStore } from "../../store/authStore";
import MessagerieConversationPage from "./MessagerieConversationPage";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return {
    ...actual,
    useMessagesPrives: vi.fn(),
    useSupprimerMessagePrive: vi.fn(),
    useLikerMessagePrive: vi.fn(),
  };
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

function mutationMock<T>(): T {
  return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false } as unknown as T;
}

function socketMock(overrides: Partial<useMessagerieSocketHook.UseMessagerieSocketResult> = {}) {
  return {
    statut: "ouvert",
    messages: [],
    messagesSupprimesIds: [],
    likesRecus: [],
    erreur: null,
    envoyer: vi.fn(),
    marquerLu: vi.fn(),
    ...overrides,
  } as useMessagerieSocketHook.UseMessagerieSocketResult;
}

function messagePrive(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "m1",
    conversation: "c1",
    expediteur: "u2",
    contenu: "Salut !",
    est_lu: true,
    lu_le: null,
    created_at: "2026-01-01T10:00:00Z",
    est_expediteur: false,
    nombre_likes: 0,
    jaime: false,
    repond_a: null,
    repond_a_detail: null,
    ...overrides,
  };
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
    vi.mocked(useCommunauteHooks.useSupprimerMessagePrive).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useSupprimerMessagePrive>>(),
    );
    vi.mocked(useCommunauteHooks.useLikerMessagePrive).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useLikerMessagePrive>>(),
    );
    vi.mocked(useMessagerieSocketHook.useMessagerieSocket).mockReturnValue(socketMock());
  });

  it("affiche l'historique des messages", () => {
    vi.mocked(useCommunauteHooks.useMessagesPrives).mockReturnValue({
      data: page([messagePrive()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useMessagesPrives>);

    renderConversation();

    expect(screen.getByText("Salut !")).toBeInTheDocument();
  });

  it("envoie un message via le WebSocket", () => {
    const envoyer = vi.fn();
    vi.mocked(useMessagerieSocketHook.useMessagerieSocket).mockReturnValue(socketMock({ envoyer }));

    renderConversation();

    fireEvent.change(screen.getByPlaceholderText("messagerie.placeholder_message"), {
      target: { value: "Coucou" },
    });
    fireEvent.click(screen.getByText("messagerie.envoyer"));

    expect(envoyer).toHaveBeenCalledWith("Coucou", undefined);
  });

  it("désactive le formulaire tant que la connexion n'est pas ouverte", () => {
    vi.mocked(useMessagerieSocketHook.useMessagerieSocket).mockReturnValue(
      socketMock({ statut: "connexion" }),
    );

    renderConversation();

    expect(screen.getByPlaceholderText("messagerie.placeholder_message")).toBeDisabled();
  });

  it("affiche le bouton supprimer uniquement sur mes propres messages et appelle la mutation (demande utilisateur du 2026-09-16)", () => {
    const supprimer =
      mutationMock<ReturnType<typeof useCommunauteHooks.useSupprimerMessagePrive>>();
    vi.mocked(useCommunauteHooks.useSupprimerMessagePrive).mockReturnValue(supprimer);
    vi.mocked(useCommunauteHooks.useMessagesPrives).mockReturnValue({
      data: page([
        messagePrive({ id: "m1", expediteur: "u1", contenu: "Le mien", est_expediteur: true }),
        messagePrive({
          id: "m2",
          expediteur: "u2",
          contenu: "Celui de l'autre",
          created_at: "2026-01-01T10:01:00Z",
          est_expediteur: false,
        }),
      ]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useMessagesPrives>);

    renderConversation();

    expect(screen.getAllByText("messagerie.supprimer_message")).toHaveLength(1);
    fireEvent.click(screen.getByText("messagerie.supprimer_message"));
    expect(supprimer.mutate).toHaveBeenCalledWith("m1");
  });

  it("affiche une erreur du socket", () => {
    vi.mocked(useMessagerieSocketHook.useMessagerieSocket).mockReturnValue(
      socketMock({
        erreur: "Connexion à la messagerie perdue — veuillez réessayer dans un instant.",
      }),
    );

    renderConversation();

    expect(
      screen.getByText("Connexion à la messagerie perdue — veuillez réessayer dans un instant."),
    ).toBeInTheDocument();
  });

  it("like un message et affiche le compteur (demande utilisateur 2026-09-25)", () => {
    const liker = mutationMock<ReturnType<typeof useCommunauteHooks.useLikerMessagePrive>>();
    vi.mocked(useCommunauteHooks.useLikerMessagePrive).mockReturnValue(liker);
    vi.mocked(useCommunauteHooks.useMessagesPrives).mockReturnValue({
      data: page([messagePrive({ nombre_likes: 2, jaime: true })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useMessagesPrives>);

    renderConversation();

    expect(screen.getByText("2")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("messagerie.liker_aria"));
    expect(liker.mutate).toHaveBeenCalledWith("m1");
  });

  it("applique un évènement message_like reçu par le WebSocket au compteur partagé", () => {
    vi.mocked(useCommunauteHooks.useMessagesPrives).mockReturnValue({
      data: page([messagePrive({ nombre_likes: 0, jaime: false })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useMessagesPrives>);
    vi.mocked(useMessagerieSocketHook.useMessagerieSocket).mockReturnValue(
      socketMock({
        likesRecus: [
          { type: "message_like", id: "m1", nombre_likes: 1, membre_id: "u1", aime: true },
        ],
      }),
    );

    renderConversation();

    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("prépare une réponse citant le message puis l'envoie avec repond_a", () => {
    const envoyer = vi.fn();
    vi.mocked(useCommunauteHooks.useMessagesPrives).mockReturnValue({
      data: page([messagePrive({ contenu: "Message original" })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useMessagesPrives>);
    vi.mocked(useMessagerieSocketHook.useMessagerieSocket).mockReturnValue(socketMock({ envoyer }));

    renderConversation();

    fireEvent.click(screen.getByText("messagerie.repondre"));
    expect(screen.getByText("messagerie.reponse_a")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("messagerie.placeholder_message"), {
      target: { value: "Ma réponse" },
    });
    fireEvent.click(screen.getByText("messagerie.envoyer"));

    expect(envoyer).toHaveBeenCalledWith("Ma réponse", "m1");
  });

  it("affiche la citation du message répondu sur un message reçu", () => {
    vi.mocked(useCommunauteHooks.useMessagesPrives).mockReturnValue({
      data: page([
        messagePrive({
          repond_a: "m0",
          repond_a_detail: { id: "m0", contenu: "Premier message", expediteur: { id: "u2" } },
        }),
      ]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useMessagesPrives>);

    renderConversation();

    expect(screen.getByText("Premier message")).toBeInTheDocument();
  });

  it("insère un emoji dans le champ de saisie via le sélecteur", () => {
    renderConversation();

    fireEvent.click(screen.getByLabelText("emoji.bouton_aria"));
    fireEvent.click(screen.getByText("😀"));

    expect(screen.getByPlaceholderText("messagerie.placeholder_message")).toHaveValue("😀");
  });
});
