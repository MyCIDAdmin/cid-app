import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import { useAuthStore } from "../../store/authStore";
import type { Sujet } from "../../types/communaute";
import ForumPage from "./ForumPage";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return {
    ...actual,
    useSujets: vi.fn(),
    useCreerSujet: vi.fn(),
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

const auteurA = { id: "m1", prenom: "Hamza", nom: "Meddeb", photo: null };

function sujet(overrides: Partial<Sujet> = {}): Sujet {
  return {
    id: "s1",
    auteur: auteurA,
    categorie: "general",
    titre: "Bienvenue sur le forum",
    contenu: "Premier sujet du forum.",
    est_epingle: false,
    est_verrouille: false,
    est_masque: false,
    motif_masquage: "",
    created_at: "2026-01-01T10:00:00Z",
    updated_at: "2026-01-01T10:00:00Z",
    nombre_reponses: 0,
    nombre_reaktionen: 0,
    reaktionen: [],
    letzte_aktivitaet: "2026-01-01T10:00:00Z",
    letzte_antwort_von: null,
    beste_antwort: null,
    reponses: [],
    est_auteur: false,
    ...overrides,
  };
}

function mutationMock() {
  return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false } as unknown as ReturnType<
    typeof useCommunauteHooks.useCreerSujet
  >;
}

describe("ForumPage", () => {
  const originalShare = navigator.share;

  beforeEach(() => {
    window.localStorage.clear();
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: membre,
      isAuthenticated: true,
    });
    vi.mocked(useCommunauteHooks.useCreerSujet).mockReturnValue(mutationMock());
    vi.mocked(useCommunauteHooks.useRechercherMembres).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useRechercherMembres>);
  });

  afterEach(() => {
    Object.defineProperty(navigator, "share", { value: originalShare, configurable: true });
  });

  it("affiche la liste des sujets avec les sujets épinglés signalés", () => {
    vi.mocked(useCommunauteHooks.useSujets).mockReturnValue({
      data: page([
        sujet({ titre: "Sujet normal" }),
        sujet({ id: "s2", titre: "Sujet épinglé", est_epingle: true }),
      ]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useSujets>);

    renderWithProviders(<ForumPage />, { route: "/forum", path: "/forum" });

    expect(screen.getByText("Sujet normal")).toBeInTheDocument();
    expect(screen.getByText("Sujet épinglé")).toBeInTheDocument();
  });

  it("affiche un message si aucun sujet", () => {
    vi.mocked(useCommunauteHooks.useSujets).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useSujets>);

    renderWithProviders(<ForumPage />);

    expect(screen.getByText("forum.aucun_sujet")).toBeInTheDocument();
  });

  it("ouvre le formulaire et crée un sujet", () => {
    const creer = mutationMock();
    vi.mocked(useCommunauteHooks.useCreerSujet).mockReturnValue(creer);
    vi.mocked(useCommunauteHooks.useSujets).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useSujets>);

    renderWithProviders(<ForumPage />);

    fireEvent.click(screen.getByText("forum.nouveau_sujet"));
    fireEvent.change(screen.getByPlaceholderText("forum.titre_placeholder"), {
      target: { value: "Un nouveau sujet" },
    });
    fireEvent.change(screen.getByPlaceholderText("forum.contenu_placeholder"), {
      target: { value: "Le contenu du sujet." },
    });
    fireEvent.click(screen.getByText("forum.publier_sujet"));

    expect(creer.mutate).toHaveBeenCalledWith(
      {
        categorie: "general",
        titre: "Un nouveau sujet",
        contenu: "Le contenu du sujet.",
        mentions: [],
      },
      expect.anything(),
    );
  });

  it("propose une mention '@' dans le nouveau sujet et l'inclut dans mentions à l'envoi", () => {
    // Ajouté le 2026-09-29 — voir hooks/useMentionAutocomplete.ts.
    const creer = mutationMock();
    vi.mocked(useCommunauteHooks.useCreerSujet).mockReturnValue(creer);
    vi.mocked(useCommunauteHooks.useSujets).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useSujets>);
    vi.mocked(useCommunauteHooks.useRechercherMembres).mockReturnValue({
      data: [{ id: "m9", prenom: "Cible", nom: "Test", photo: null }],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useRechercherMembres>);

    renderWithProviders(<ForumPage />);

    fireEvent.click(screen.getByText("forum.nouveau_sujet"));
    fireEvent.change(screen.getByPlaceholderText("forum.titre_placeholder"), {
      target: { value: "Un nouveau sujet" },
    });
    fireEvent.change(screen.getByPlaceholderText("forum.contenu_placeholder"), {
      target: { value: "Salut @Ci" },
    });
    fireEvent.click(screen.getByText("Cible Test"));
    fireEvent.click(screen.getByText("forum.publier_sujet"));

    expect(creer.mutate).toHaveBeenCalledWith(
      {
        categorie: "general",
        titre: "Un nouveau sujet",
        contenu: "Salut @Cible ",
        mentions: ["m9"],
      },
      expect.anything(),
    );
  });

  it("affiche un bouton de partage externe sur chaque sujet, cliquable indépendamment de la carte", () => {
    // Retour utilisateur du 2026-09-29, module "Forum" : "Es soll möglich sein Elemente in
    // Social Media zu teilen" — la carte entière est un lien vers le sujet (voir
    // ForumPage.tsx : Link en superposition + contenu pointer-events-none), le bouton de
    // partage doit rester cliquable malgré ça (zone pointer-events-auto dédiée).
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    vi.mocked(useCommunauteHooks.useSujets).mockReturnValue({
      data: page([
        sujet({ titre: "Sujet normal" }),
        sujet({ id: "s2", titre: "Sujet épinglé", est_epingle: true }),
      ]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useSujets>);

    renderWithProviders(<ForumPage />, { route: "/forum", path: "/forum" });

    const boutonsPartage = screen.getAllByLabelText("partage.bouton_aria");
    expect(boutonsPartage).toHaveLength(2);

    fireEvent.click(boutonsPartage[0]);
    expect(screen.getByText("partage.whatsapp")).toBeInTheDocument();
    // La liste des sujets reste affichée — pas de navigation déclenchée par la carte.
    expect(screen.getByText("Sujet normal")).toBeInTheDocument();
    expect(screen.getByText("Sujet épinglé")).toBeInTheDocument();
  });

  it("zeigt Antwortzahl, letzte Aktivität mit Name, Reaktionen und Gelöst-Marke", () => {
    vi.mocked(useCommunauteHooks.useSujets).mockReturnValue({
      data: page([
        sujet({
          nombre_reponses: 4,
          nombre_reaktionen: 2,
          letzte_antwort_von: "Sami",
          beste_antwort: "r1",
        }),
      ]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useSujets>);

    renderWithProviders(<ForumPage />);

    expect(screen.getByText("forum.nombre_reponses")).toBeInTheDocument();
    expect(screen.getByText(/forum.nombre_reaktionen/)).toBeInTheDocument();
    expect(screen.getByText("forum.letzte_aktivitaet")).toBeInTheDocument();
    expect(screen.getByText(/forum.geloest/)).toBeInTheDocument();
  });

  it("ohne letzten Antwortenden steht nur die Aktivitätszeit", () => {
    vi.mocked(useCommunauteHooks.useSujets).mockReturnValue({
      data: page([sujet({ letzte_antwort_von: null })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useSujets>);

    renderWithProviders(<ForumPage />);

    expect(screen.getByText("forum.letzte_aktivitaet_ohne")).toBeInTheDocument();
  });

  it("markiert neue Aktivität mit einem Punkt, aber nicht die eigenen oder gesehenen Themen", () => {
    // Grundlinie : erster Besuch war am 1. Januar 2026, 12:00.
    window.localStorage.setItem(
      "forum:basis:u1",
      JSON.stringify(new Date("2026-01-01T12:00:00Z").getTime()),
    );
    window.localStorage.setItem(
      "forum:gesehen:u1",
      JSON.stringify({ s4: new Date("2026-01-03T12:00:00Z").getTime() }),
    );
    vi.mocked(useCommunauteHooks.useSujets).mockReturnValue({
      data: page([
        sujet({ id: "s1", titre: "Neu", letzte_aktivitaet: "2026-01-02T10:00:00Z" }),
        sujet({ id: "s2", titre: "Alt", letzte_aktivitaet: "2025-12-30T10:00:00Z" }),
        sujet({
          id: "s3",
          titre: "Eigenes",
          est_auteur: true,
          letzte_aktivitaet: "2026-01-02T10:00:00Z",
        }),
        sujet({ id: "s4", titre: "Gesehen", letzte_aktivitaet: "2026-01-02T10:00:00Z" }),
      ]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useSujets>);

    renderWithProviders(<ForumPage />);

    expect(screen.getAllByRole("img", { name: "forum.neu_marke" })).toHaveLength(1);
  });

  it("sucht mit kurzer Verzögerung und reicht die Suche an den Server weiter", () => {
    vi.useFakeTimers();
    try {
      const useSujetsMock = vi.mocked(useCommunauteHooks.useSujets);
      useSujetsMock.mockReturnValue({
        data: page([]),
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useCommunauteHooks.useSujets>);

      renderWithProviders(<ForumPage />);

      fireEvent.change(screen.getByPlaceholderText("forum.suche_placeholder"), {
        target: { value: "  München " },
      });
      expect(useSujetsMock).not.toHaveBeenLastCalledWith(
        expect.objectContaining({ suche: "München" }),
      );
      act(() => {
        vi.advanceTimersByTime(350);
      });
      expect(useSujetsMock).toHaveBeenLastCalledWith(expect.objectContaining({ suche: "München" }));
      expect(screen.getByText("forum.aucun_resultat")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("wechselt die Sortierung und den Chip Unbeantwortet", () => {
    const useSujetsMock = vi.mocked(useCommunauteHooks.useSujets);
    useSujetsMock.mockReturnValue({
      data: page([sujet()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useSujets>);

    renderWithProviders(<ForumPage />);
    expect(useSujetsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ sortierung: "aktiv" }),
    );

    fireEvent.click(screen.getByText("forum.sort_neu"));
    expect(useSujetsMock).toHaveBeenLastCalledWith(expect.objectContaining({ sortierung: "neu" }));
    fireEvent.click(screen.getByText("forum.sort_beliebt"));
    expect(useSujetsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ sortierung: "beliebt" }),
    );
    fireEvent.click(screen.getByText("forum.sort_unbeantwortet"));
    expect(useSujetsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ sortierung: "aktiv", unbeantwortet: true }),
    );
    expect(screen.getByText("forum.sort_unbeantwortet")).toHaveAttribute("aria-pressed", "true");
  });

  it("filtre par catégorie", () => {
    const useSujetsMock = vi.mocked(useCommunauteHooks.useSujets);
    useSujetsMock.mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useSujets>);

    renderWithProviders(<ForumPage />);

    fireEvent.click(screen.getByText("categorie.emploi"));

    expect(useSujetsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ categorie: "emploi" }),
    );
  });
});
