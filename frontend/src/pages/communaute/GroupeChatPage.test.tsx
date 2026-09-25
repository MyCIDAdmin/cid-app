import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import * as useGroupeChatSocketHook from "../../hooks/useGroupeChatSocket";
import { useAuthStore } from "../../store/authStore";
import GroupeChatPage from "./GroupeChatPage";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return {
    ...actual,
    useGroupe: vi.fn(),
    useMessagesGroupe: vi.fn(),
    useQuitterGroupe: vi.fn(),
    useSupprimerGroupe: vi.fn(),
    useSupprimerMessageGroupe: vi.fn(),
    useLikerMessageGroupe: vi.fn(),
  };
});

vi.mock("../../hooks/useGroupeChatSocket", () => ({ useGroupeChatSocket: vi.fn() }));

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

function socketMock(overrides: Partial<useGroupeChatSocketHook.UseGroupeChatSocketResult> = {}) {
  return {
    statut: "ouvert",
    messages: [],
    messagesSupprimesIds: [],
    likesRecus: [],
    erreur: null,
    envoyer: vi.fn(),
    ...overrides,
  } as useGroupeChatSocketHook.UseGroupeChatSocketResult;
}

function messageGroupe(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "m1",
    groupe: "g1",
    auteur: { id: "m2", prenom: "Hamza", nom: "Meddeb", photo: null },
    contenu: "Bienvenue !",
    created_at: "2026-01-01T10:00:00Z",
    est_auteur: false,
    nombre_likes: 0,
    jaime: false,
    repond_a: null,
    repond_a_detail: null,
    ...overrides,
  };
}

function renderGroupe() {
  return renderWithProviders(<GroupeChatPage />, { route: "/groupes/g1", path: "/groupes/:id" });
}

describe("GroupeChatPage", () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: membre,
      isAuthenticated: true,
    });
    vi.mocked(useCommunauteHooks.useGroupe).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useGroupe>);
    vi.mocked(useCommunauteHooks.useMessagesGroupe).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useMessagesGroupe>);
    vi.mocked(useCommunauteHooks.useQuitterGroupe).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useQuitterGroupe>>(),
    );
    vi.mocked(useCommunauteHooks.useSupprimerGroupe).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useSupprimerGroupe>>(),
    );
    vi.mocked(useCommunauteHooks.useSupprimerMessageGroupe).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useSupprimerMessageGroupe>>(),
    );
    vi.mocked(useCommunauteHooks.useLikerMessageGroupe).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useLikerMessageGroupe>>(),
    );
    vi.mocked(useGroupeChatSocketHook.useGroupeChatSocket).mockReturnValue(socketMock());
  });

  it("affiche l'historique des messages avec le nom de l'auteur", () => {
    vi.mocked(useCommunauteHooks.useMessagesGroupe).mockReturnValue({
      data: page([messageGroupe()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useMessagesGroupe>);

    renderGroupe();

    expect(screen.getByText("Bienvenue !")).toBeInTheDocument();
    expect(screen.getByText("Hamza Meddeb")).toBeInTheDocument();
  });

  it("envoie un message via le WebSocket", () => {
    const envoyer = vi.fn();
    vi.mocked(useGroupeChatSocketHook.useGroupeChatSocket).mockReturnValue(socketMock({ envoyer }));

    renderGroupe();

    fireEvent.change(screen.getByPlaceholderText("groupes.placeholder_message"), {
      target: { value: "Coucou tout le monde" },
    });
    fireEvent.click(screen.getByText("groupes.envoyer"));

    expect(envoyer).toHaveBeenCalledWith("Coucou tout le monde", undefined);
  });

  it("quitter le groupe appelle la mutation", () => {
    const quitter = mutationMock<ReturnType<typeof useCommunauteHooks.useQuitterGroupe>>();
    vi.mocked(useCommunauteHooks.useQuitterGroupe).mockReturnValue(quitter);

    renderGroupe();

    fireEvent.click(screen.getByText("groupes.quitter"));

    expect(quitter.mutate).toHaveBeenCalledWith("g1", expect.anything());
  });

  it("n'affiche pas 'supprimer le groupe' à un membre qui n'est pas le créateur", () => {
    vi.mocked(useCommunauteHooks.useGroupe).mockReturnValue({
      data: { id: "g1", nom: "Supporters", est_createur: false },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useGroupe>);

    renderGroupe();

    expect(screen.queryByText("groupes.supprimer_groupe")).not.toBeInTheDocument();
  });

  it("le créateur voit 'supprimer le groupe' et la mutation est appelée au clic (demande utilisateur du 2026-09-16)", () => {
    const supprimerGroupe =
      mutationMock<ReturnType<typeof useCommunauteHooks.useSupprimerGroupe>>();
    vi.mocked(useCommunauteHooks.useSupprimerGroupe).mockReturnValue(supprimerGroupe);
    vi.mocked(useCommunauteHooks.useGroupe).mockReturnValue({
      data: { id: "g1", nom: "Supporters", est_createur: true },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useGroupe>);

    renderGroupe();

    fireEvent.click(screen.getByText("groupes.supprimer_groupe"));
    expect(supprimerGroupe.mutate).toHaveBeenCalledWith("g1", expect.anything());
  });

  it("affiche le bouton supprimer uniquement sur mes propres messages de groupe et appelle la mutation", () => {
    const supprimerMessage =
      mutationMock<ReturnType<typeof useCommunauteHooks.useSupprimerMessageGroupe>>();
    vi.mocked(useCommunauteHooks.useSupprimerMessageGroupe).mockReturnValue(supprimerMessage);
    vi.mocked(useCommunauteHooks.useMessagesGroupe).mockReturnValue({
      data: page([
        messageGroupe({
          id: "m1",
          auteur: { id: "u1", prenom: "Moi", nom: "Même", photo: null },
          contenu: "Le mien",
          est_auteur: true,
        }),
        messageGroupe({
          id: "m2",
          contenu: "Celui de l'autre",
          created_at: "2026-01-01T10:01:00Z",
        }),
      ]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useMessagesGroupe>);

    renderGroupe();

    expect(screen.getAllByText("groupes.supprimer_message")).toHaveLength(1);
    fireEvent.click(screen.getByText("groupes.supprimer_message"));
    expect(supprimerMessage.mutate).toHaveBeenCalledWith("m1");
  });

  it("like un message de groupe et affiche le compteur (demande utilisateur 2026-09-25)", () => {
    const liker = mutationMock<ReturnType<typeof useCommunauteHooks.useLikerMessageGroupe>>();
    vi.mocked(useCommunauteHooks.useLikerMessageGroupe).mockReturnValue(liker);
    vi.mocked(useCommunauteHooks.useMessagesGroupe).mockReturnValue({
      data: page([messageGroupe({ nombre_likes: 3, jaime: true })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useMessagesGroupe>);

    renderGroupe();

    expect(screen.getByText("3")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("messagerie.liker_aria"));
    expect(liker.mutate).toHaveBeenCalledWith("m1");
  });

  it("prépare une réponse citant le message puis l'envoie avec repond_a", () => {
    const envoyer = vi.fn();
    vi.mocked(useCommunauteHooks.useMessagesGroupe).mockReturnValue({
      data: page([messageGroupe({ contenu: "Premier message du groupe" })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useMessagesGroupe>);
    vi.mocked(useGroupeChatSocketHook.useGroupeChatSocket).mockReturnValue(socketMock({ envoyer }));

    renderGroupe();

    fireEvent.click(screen.getByText("messagerie.repondre"));
    fireEvent.change(screen.getByPlaceholderText("groupes.placeholder_message"), {
      target: { value: "Ma réponse" },
    });
    fireEvent.click(screen.getByText("groupes.envoyer"));

    expect(envoyer).toHaveBeenCalledWith("Ma réponse", "m1");
  });

  it("met en forme les mentions '@' dans le contenu affiché", () => {
    vi.mocked(useCommunauteHooks.useMessagesGroupe).mockReturnValue({
      data: page([messageGroupe({ contenu: "Salut @Hamza, tu viens ?" })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useMessagesGroupe>);

    renderGroupe();

    expect(screen.getByText("@Hamza")).toBeInTheDocument();
  });

  it("suggère les auteurs connus lors de la frappe d'une mention '@'", () => {
    vi.mocked(useCommunauteHooks.useMessagesGroupe).mockReturnValue({
      data: page([messageGroupe()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useMessagesGroupe>);

    renderGroupe();

    fireEvent.change(screen.getByPlaceholderText("groupes.placeholder_message"), {
      target: { value: "Salut @Ha" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Hamza Meddeb" }));

    expect(screen.getByPlaceholderText("groupes.placeholder_message")).toHaveValue("Salut @Hamza ");
  });
});
