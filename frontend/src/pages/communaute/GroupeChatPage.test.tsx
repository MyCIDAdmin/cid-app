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
    vi.mocked(useGroupeChatSocketHook.useGroupeChatSocket).mockReturnValue({
      statut: "ouvert",
      messages: [],
      messagesSupprimesIds: [],
      erreur: null,
      envoyer: vi.fn(),
    });
  });

  it("affiche l'historique des messages avec le nom de l'auteur", () => {
    vi.mocked(useCommunauteHooks.useMessagesGroupe).mockReturnValue({
      data: page([
        {
          id: "m1",
          groupe: "g1",
          auteur: { id: "m2", prenom: "Hamza", nom: "Meddeb", photo: null },
          contenu: "Bienvenue !",
          created_at: "2026-01-01T10:00:00Z",
          est_auteur: false,
        },
      ]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useMessagesGroupe>);

    renderGroupe();

    expect(screen.getByText("Bienvenue !")).toBeInTheDocument();
    expect(screen.getByText("Hamza Meddeb")).toBeInTheDocument();
  });

  it("envoie un message via le WebSocket", () => {
    const envoyer = vi.fn();
    vi.mocked(useGroupeChatSocketHook.useGroupeChatSocket).mockReturnValue({
      statut: "ouvert",
      messages: [],
      messagesSupprimesIds: [],
      erreur: null,
      envoyer,
    });

    renderGroupe();

    fireEvent.change(screen.getByPlaceholderText("groupes.placeholder_message"), {
      target: { value: "Coucou tout le monde" },
    });
    fireEvent.click(screen.getByText("groupes.envoyer"));

    expect(envoyer).toHaveBeenCalledWith("Coucou tout le monde");
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
    const supprimerGroupe = mutationMock<ReturnType<typeof useCommunauteHooks.useSupprimerGroupe>>();
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
        {
          id: "m1",
          groupe: "g1",
          auteur: { id: "u1", prenom: "Moi", nom: "Même", photo: null },
          contenu: "Le mien",
          created_at: "2026-01-01T10:00:00Z",
          est_auteur: true,
        },
        {
          id: "m2",
          groupe: "g1",
          auteur: { id: "m2", prenom: "Hamza", nom: "Meddeb", photo: null },
          contenu: "Celui de l'autre",
          created_at: "2026-01-01T10:01:00Z",
          est_auteur: false,
        },
      ]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useMessagesGroupe>);

    renderGroupe();

    expect(screen.getAllByText("groupes.supprimer_message")).toHaveLength(1);
    fireEvent.click(screen.getByText("groupes.supprimer_message"));
    expect(supprimerMessage.mutate).toHaveBeenCalledWith("m1");
  });
});
