import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import { useAuthStore } from "../../store/authStore";
import type { Commentaire, Publication } from "../../types/communaute";
import FilPage from "./FilPage";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return {
    ...actual,
    usePublications: vi.fn(),
    useCreerPublication: vi.fn(),
    useSupprimerPublication: vi.fn(),
    useReagieren: vi.fn(),
    usePartagerPublication: vi.fn(),
    useMasquerPublication: vi.fn(),
    useCommenterPublication: vi.fn(),
    useSupprimerCommentaire: vi.fn(),
    useMasquerCommentaire: vi.fn(),
    useRechercherMembres: vi.fn(),
  };
});

// RichTextEditor (TipTap/ProseMirror, retour utilisateur du 2026-09-29, point 3.2 — remplace le
// <textarea> brut) ne peut pas être piloté par fireEvent dans jsdom (voir même mock dans
// AdminEventsPage.test.tsx) : remplacé ici par un <textarea> minimal exposant le même contrat
// value/onChange/placeholder/ariaLabel.
vi.mock("../../components/ui/RichTextEditor", () => ({
  default: ({
    value,
    onChange,
    placeholder,
    ariaLabel,
  }: {
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
    ariaLabel?: string;
  }) => (
    <textarea
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

const membre = {
  id: "u1",
  email: "membre@example.com",
  role: "membre" as const,
  langue_preferee: "fr" as const,
};

const bureauAdmin = { ...membre, id: "u2", role: "bureau_admin" as const };

function page<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

const auteurA = { id: "m1", prenom: "Sana", nom: "Werfelli", photo: null };

function publication(overrides: Partial<Publication> = {}): Publication {
  return {
    id: "p1",
    auteur: auteurA,
    contenu: "Allez le CA !",
    image: null,
    document: null,
    hashtags: [],
    important: false,
    est_masquee: false,
    motif_masquage: "",
    created_at: "2026-01-01T10:00:00Z",
    updated_at: "2026-01-01T10:00:00Z",
    nombre_likes: 0,
    nombre_partages: 0,
    nombre_commentaires: 0,
    jaime: false,
    jai_partage: false,
    est_auteur: false,
    commentaires: [],
    reaktionen: [],
    ...overrides,
  };
}

function kommentar(overrides: Partial<Commentaire> = {}): Commentaire {
  return {
    id: "c1",
    publication: "p1",
    parent: null,
    auteur: auteurA,
    contenu: "Ein Kommentar",
    est_masque: false,
    created_at: "2026-01-01T11:00:00Z",
    reponses: [],
    est_auteur: false,
    reaktionen: [],
    ...overrides,
  };
}

function mutationMock<T>(): T {
  return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false } as unknown as T;
}

describe("FilPage", () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: membre,
      isAuthenticated: true,
    });
    vi.mocked(useCommunauteHooks.useCreerPublication).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useCreerPublication>>(),
    );
    vi.mocked(useCommunauteHooks.useSupprimerPublication).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useSupprimerPublication>>(),
    );
    vi.mocked(useCommunauteHooks.useReagieren).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useReagieren>>(),
    );
    vi.mocked(useCommunauteHooks.usePartagerPublication).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.usePartagerPublication>>(),
    );
    vi.mocked(useCommunauteHooks.useMasquerPublication).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useMasquerPublication>>(),
    );
    vi.mocked(useCommunauteHooks.useCommenterPublication).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useCommenterPublication>>(),
    );
    vi.mocked(useCommunauteHooks.useSupprimerCommentaire).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useSupprimerCommentaire>>(),
    );
    vi.mocked(useCommunauteHooks.useMasquerCommentaire).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useMasquerCommentaire>>(),
    );
    vi.mocked(useCommunauteHooks.useRechercherMembres).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useRechercherMembres>);
  });

  it("affiche les publications du fil", () => {
    vi.mocked(useCommunauteHooks.usePublications).mockReturnValue({
      data: page([publication({ contenu: "Belle victoire hier soir" })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.usePublications>);

    renderWithProviders(<FilPage />);

    expect(screen.getByText("Belle victoire hier soir")).toBeInTheDocument();
    expect(screen.getByText("Sana Werfelli")).toBeInTheDocument();
  });

  it("affiche un message si le fil est vide", () => {
    vi.mocked(useCommunauteHooks.usePublications).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.usePublications>);

    renderWithProviders(<FilPage />);

    expect(screen.getByText("fil.aucune_publication")).toBeInTheDocument();
  });

  it("affiche les hashtags d'une publication", () => {
    vi.mocked(useCommunauteHooks.usePublications).mockReturnValue({
      data: page([publication({ hashtags: ["ca1920", "berlin"] })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.usePublications>);

    renderWithProviders(<FilPage />);

    expect(screen.getByText("#ca1920")).toBeInTheDocument();
    expect(screen.getByText("#berlin")).toBeInTheDocument();
  });

  // Retour utilisateur du 2026-09-29 : "cliquer un hashtag filtre le fil" — le filtre backend/
  // hook existait déjà (usePublications({hashtag})), seul le câblage UI manquait.
  it("cliquer un hashtag appelle usePublications avec ce filtre et affiche le bandeau actif", () => {
    vi.mocked(useCommunauteHooks.usePublications).mockReturnValue({
      data: page([publication({ hashtags: ["ca1920"] })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.usePublications>);

    renderWithProviders(<FilPage />);

    fireEvent.click(screen.getByText("#ca1920"));

    expect(useCommunauteHooks.usePublications).toHaveBeenLastCalledWith({ hashtag: "ca1920" });
    expect(screen.getByText("fil.filtre_hashtag")).toBeInTheDocument();
  });

  it("retire le filtre hashtag actif au clic sur 'Filter entfernen'", () => {
    vi.mocked(useCommunauteHooks.usePublications).mockReturnValue({
      data: page([publication({ hashtags: ["ca1920"] })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.usePublications>);

    renderWithProviders(<FilPage />, { route: "/?hashtag=ca1920" });

    expect(screen.getByText("fil.filtre_hashtag")).toBeInTheDocument();
    fireEvent.click(screen.getByText("fil.retirer_filtre"));

    expect(useCommunauteHooks.usePublications).toHaveBeenLastCalledWith({ hashtag: undefined });
    expect(screen.queryByText("fil.filtre_hashtag")).not.toBeInTheDocument();
  });

  it("affiche un message dédié quand aucune publication ne correspond au hashtag filtré", () => {
    vi.mocked(useCommunauteHooks.usePublications).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.usePublications>);

    renderWithProviders(<FilPage />, { route: "/?hashtag=inconnu" });

    expect(screen.getByText("fil.aucune_publication_hashtag")).toBeInTheDocument();
    expect(screen.queryByText("fil.aucune_publication")).not.toBeInTheDocument();
  });

  it("setzt eine Emoji-Reaktion über die Schnell-Leiste", () => {
    const reagieren = mutationMock<ReturnType<typeof useCommunauteHooks.useReagieren>>();
    vi.mocked(useCommunauteHooks.useReagieren).mockReturnValue(reagieren);
    vi.mocked(useCommunauteHooks.usePublications).mockReturnValue({
      data: page([publication()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.usePublications>);

    renderWithProviders(<FilPage />);

    fireEvent.click(screen.getByLabelText("reaktionen.hinzufuegen"));
    fireEvent.click(screen.getByText("🔥"));
    expect(reagieren.mutate).toHaveBeenCalledWith({ id: "p1", emoji: "🔥" });
  });

  it("zeigt vorhandene Reaktionen als Chips ; Tippen auf die eigene entfernt sie", () => {
    const reagieren = mutationMock<ReturnType<typeof useCommunauteHooks.useReagieren>>();
    vi.mocked(useCommunauteHooks.useReagieren).mockReturnValue(reagieren);
    vi.mocked(useCommunauteHooks.usePublications).mockReturnValue({
      data: page([
        publication({
          reaktionen: [
            { emoji: "❤️", anzahl: 3, ich: true },
            { emoji: "👍", anzahl: 1, ich: false },
          ],
        }),
      ]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.usePublications>);

    renderWithProviders(<FilPage />);

    const herz = screen.getByText("3").closest("button") as HTMLButtonElement;
    expect(herz).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("1").closest("button")).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(herz);
    expect(reagieren.mutate).toHaveBeenCalledWith({ id: "p1", emoji: "❤️" });
  });

  it("filtert mit den Chips Wichtig und Fotos (Server-Filter)", () => {
    vi.mocked(useCommunauteHooks.usePublications).mockReturnValue({
      data: page([publication()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.usePublications>);

    renderWithProviders(<FilPage />);

    fireEvent.click(screen.getByText("fil.filter_wichtig"));
    expect(useCommunauteHooks.usePublications).toHaveBeenLastCalledWith(
      expect.objectContaining({ wichtig: true, mit_bild: undefined }),
    );
    fireEvent.click(screen.getByText("fil.filter_fotos"));
    expect(useCommunauteHooks.usePublications).toHaveBeenLastCalledWith(
      expect.objectContaining({ wichtig: undefined, mit_bild: true }),
    );
    expect(screen.getByText("fil.filter_fotos")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByText("fil.filter_alle"));
    expect(useCommunauteHooks.usePublications).toHaveBeenLastCalledWith(
      expect.objectContaining({ wichtig: undefined, mit_bild: undefined }),
    );
  });

  it("leerer Filter zeigt die passende Meldung", () => {
    vi.mocked(useCommunauteHooks.usePublications).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.usePublications>);

    renderWithProviders(<FilPage />, { route: "/?filter=wichtig" });

    expect(screen.getByText("fil.aucune_publication_filtre")).toBeInTheDocument();
  });

  it("wichtige Beiträge tragen das Abzeichen", () => {
    vi.mocked(useCommunauteHooks.usePublications).mockReturnValue({
      data: page([publication({ important: true })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.usePublications>);

    renderWithProviders(<FilPage />);

    expect(screen.getByText("fil.important_badge")).toBeInTheDocument();
  });

  describe("Neu seit deinem Besuch", () => {
    const frueh = "2026-01-01T10:00:00Z";
    const spaet = "2026-01-03T10:00:00Z";

    function zeigeFeed() {
      vi.mocked(useCommunauteHooks.usePublications).mockReturnValue({
        data: page([
          publication({ id: "neu1", contenu: "Neuer Beitrag", created_at: spaet }),
          publication({ id: "alt1", contenu: "Alter Beitrag", created_at: frueh }),
        ]),
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useCommunauteHooks.usePublications>);
      renderWithProviders(<FilPage />);
    }

    it("setzt eine Trennlinie zwischen neuen und älteren Beiträgen", () => {
      window.localStorage.setItem(
        "fil:besuch:u1",
        String(new Date("2026-01-02T10:00:00Z").getTime()),
      );
      zeigeFeed();

      expect(screen.getByTestId("neu-trenner")).toHaveTextContent("fil.neu_seit_besuch");
      expect(screen.getByTestId("frueher-trenner")).toBeInTheDocument();
    });

    it("zeigt beim allerersten Besuch keine Trennlinie und merkt sich den Besuch", () => {
      window.localStorage.clear();
      zeigeFeed();

      expect(screen.queryByTestId("neu-trenner")).not.toBeInTheDocument();
      expect(Number(window.localStorage.getItem("fil:besuch:u1"))).toBeGreaterThan(0);
    });
  });

  it("zeigt die letzte Kommentar-Vorschau und klappt alle Kommentare auf", () => {
    vi.mocked(useCommunauteHooks.usePublications).mockReturnValue({
      data: page([
        publication({
          nombre_commentaires: 2,
          commentaires: [
            kommentar({ id: "c1", contenu: "Erster Kommentar" }),
            kommentar({ id: "c2", contenu: "Zweiter Kommentar" }),
          ],
        }),
      ]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.usePublications>);

    renderWithProviders(<FilPage />);

    const vorschau = screen.getByTestId("kommentar-vorschau");
    expect(vorschau).toHaveTextContent("Zweiter Kommentar");
    expect(screen.queryByText("Erster Kommentar")).not.toBeInTheDocument();
    fireEvent.click(vorschau);
    expect(screen.getByText("Erster Kommentar")).toBeInTheDocument();
    expect(screen.queryByTestId("kommentar-vorschau")).not.toBeInTheDocument();
  });

  it("fügt ein Emoji in das Kommentarfeld ein", () => {
    vi.mocked(useCommunauteHooks.usePublications).mockReturnValue({
      data: page([publication()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.usePublications>);

    renderWithProviders(<FilPage />);

    fireEvent.click(screen.getByText("💬 fil.nombre_commentaires"));
    fireEvent.click(screen.getByLabelText("chats.emoji"));
    fireEvent.click(screen.getAllByRole("button", { name: "😀" })[0]);
    expect(screen.getByPlaceholderText("fil.placeholder_commentaire")).toHaveValue("😀");
  });

  it("commente une publication sans mention", () => {
    const commenter = mutationMock<ReturnType<typeof useCommunauteHooks.useCommenterPublication>>();
    vi.mocked(useCommunauteHooks.useCommenterPublication).mockReturnValue(commenter);
    vi.mocked(useCommunauteHooks.usePublications).mockReturnValue({
      data: page([publication()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.usePublications>);

    renderWithProviders(<FilPage />);

    fireEvent.click(screen.getByText("💬 fil.nombre_commentaires"));
    fireEvent.change(screen.getByPlaceholderText("fil.placeholder_commentaire"), {
      target: { value: "Bravo !" },
    });
    fireEvent.click(screen.getByText("fil.envoyer"));

    expect(commenter.mutate).toHaveBeenCalledWith(
      { publicationId: "p1", contenu: "Bravo !", parent: undefined, mentions: [] },
      expect.anything(),
    );
  });

  it("propose une mention '@' dans le champ de commentaire et l'inclut dans mentions à l'envoi", () => {
    // Ajouté le 2026-09-29 — voir hooks/useMentionAutocomplete.ts.
    const commenter = mutationMock<ReturnType<typeof useCommunauteHooks.useCommenterPublication>>();
    vi.mocked(useCommunauteHooks.useCommenterPublication).mockReturnValue(commenter);
    vi.mocked(useCommunauteHooks.usePublications).mockReturnValue({
      data: page([publication()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.usePublications>);
    vi.mocked(useCommunauteHooks.useRechercherMembres).mockReturnValue({
      data: [{ id: "m9", prenom: "Cible", nom: "Test", photo: null }],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useRechercherMembres>);

    renderWithProviders(<FilPage />);

    fireEvent.click(screen.getByText("💬 fil.nombre_commentaires"));
    fireEvent.change(screen.getByPlaceholderText("fil.placeholder_commentaire"), {
      target: { value: "Salut @Ci" },
    });
    fireEvent.click(screen.getByText("Cible Test"));
    fireEvent.click(screen.getByText("fil.envoyer"));

    expect(commenter.mutate).toHaveBeenCalledWith(
      { publicationId: "p1", contenu: "Salut @Cible ", parent: undefined, mentions: ["m9"] },
      expect.anything(),
    );
  });

  it("un membre normal ne voit pas le bouton masquer sur le contenu d'autrui", () => {
    vi.mocked(useCommunauteHooks.usePublications).mockReturnValue({
      data: page([publication({ est_auteur: false })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.usePublications>);

    renderWithProviders(<FilPage />);

    expect(screen.queryByText("fil.masquer")).not.toBeInTheDocument();
    expect(screen.queryByText("fil.supprimer")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("fil.mehr")).not.toBeInTheDocument();
  });

  it("un bureau admin voit le bouton masquer sur le contenu d'autrui", () => {
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: bureauAdmin,
      isAuthenticated: true,
    });
    vi.mocked(useCommunauteHooks.usePublications).mockReturnValue({
      data: page([publication({ est_auteur: false })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.usePublications>);

    renderWithProviders(<FilPage />);

    fireEvent.click(screen.getByLabelText("fil.mehr"));
    expect(screen.getByText("fil.masquer")).toBeInTheDocument();
  });

  it("un bureau admin voit aussi le bouton supprimer sur le contenu d'autrui (AHM-XX)", () => {
    // Demande utilisateur du 2026-09-16 : "Posts müssen vom Admin Verwaltbar werden sein
    // (Gelöscht/Archiviert)" — le backend autorisait déjà la suppression admin, il manquait
    // le bouton.
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: bureauAdmin,
      isAuthenticated: true,
    });
    vi.mocked(useCommunauteHooks.usePublications).mockReturnValue({
      data: page([publication({ est_auteur: false })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.usePublications>);

    renderWithProviders(<FilPage />);

    fireEvent.click(screen.getByLabelText("fil.mehr"));
    expect(screen.getAllByText("fil.supprimer")).toHaveLength(1);
    expect(screen.getByText("fil.masquer")).toBeInTheDocument();
  });

  it("appelle supprimer au clic du bouton supprimer d'un bureau admin sur le contenu d'autrui", () => {
    const supprimer = mutationMock<ReturnType<typeof useCommunauteHooks.useSupprimerPublication>>();
    vi.mocked(useCommunauteHooks.useSupprimerPublication).mockReturnValue(supprimer);
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: bureauAdmin,
      isAuthenticated: true,
    });
    vi.mocked(useCommunauteHooks.usePublications).mockReturnValue({
      data: page([publication({ id: "p9", est_auteur: false })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.usePublications>);

    renderWithProviders(<FilPage />);
    fireEvent.click(screen.getByLabelText("fil.mehr"));
    fireEvent.click(screen.getByText("fil.supprimer"));
    expect(supprimer.mutate).toHaveBeenCalledWith("p9");
  });

  it("l'auteur voit le bouton supprimer sur sa propre publication", () => {
    vi.mocked(useCommunauteHooks.usePublications).mockReturnValue({
      data: page([publication({ est_auteur: true })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.usePublications>);

    renderWithProviders(<FilPage />);

    fireEvent.click(screen.getByLabelText("fil.mehr"));
    expect(screen.getByText("fil.supprimer")).toBeInTheDocument();
  });

  it("soumet une nouvelle publication", () => {
    // Retour utilisateur du 2026-09-29, point 3.1 : seuls Bureau Admin+ voient l'éditeur
    // (voir PublicationPermission côté backend et les deux tests ci-dessous).
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: bureauAdmin,
      isAuthenticated: true,
    });
    const creer = mutationMock<ReturnType<typeof useCommunauteHooks.useCreerPublication>>();
    vi.mocked(useCommunauteHooks.useCreerPublication).mockReturnValue(creer);
    vi.mocked(useCommunauteHooks.usePublications).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.usePublications>);

    renderWithProviders(<FilPage />);

    fireEvent.click(screen.getByText("fil.composer_zeile"));
    fireEvent.change(screen.getByPlaceholderText("fil.placeholder_publication"), {
      target: { value: "Nouvelle actu" },
    });
    fireEvent.click(screen.getByText("fil.publier"));

    expect(creer.mutate).toHaveBeenCalledWith(
      { contenu: "Nouvelle actu", image: undefined, document: undefined, important: false },
      expect.anything(),
    );
  });

  it("un membre normal ne voit pas l'éditeur de publication (lecture seule)", () => {
    // Retour utilisateur du 2026-09-29, point 3.1 : "Normal User sollen den Editor nicht
    // sehen (Nur Lese Zugriff und Reaktionen auf freigegeben Neuigkeiten)".
    vi.mocked(useCommunauteHooks.usePublications).mockReturnValue({
      data: page([publication({ contenu: "Actu déjà publiée" })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.usePublications>);

    renderWithProviders(<FilPage />);

    expect(screen.queryByPlaceholderText("fil.placeholder_publication")).not.toBeInTheDocument();
    expect(screen.queryByText("fil.publier")).not.toBeInTheDocument();
    // Lecture et réactions restent disponibles.
    expect(screen.getByText("Actu déjà publiée")).toBeInTheDocument();
  });

  it("un bureau admin voit l'éditeur de publication", () => {
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: bureauAdmin,
      isAuthenticated: true,
    });
    vi.mocked(useCommunauteHooks.usePublications).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.usePublications>);

    renderWithProviders(<FilPage />);

    // Eingeklappt : nur die eine Zeile ; erst das Antippen öffnet den Editor.
    expect(screen.queryByPlaceholderText("fil.placeholder_publication")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("fil.composer_zeile"));
    expect(screen.getByPlaceholderText("fil.placeholder_publication")).toBeInTheDocument();
    expect(screen.getByText("fil.publier")).toBeInTheDocument();
    fireEvent.click(screen.getByText("fil.abbrechen"));
    expect(screen.queryByPlaceholderText("fil.placeholder_publication")).not.toBeInTheDocument();
  });

  it("affiche un lien vers le document joint à une publication", () => {
    vi.mocked(useCommunauteHooks.usePublications).mockReturnValue({
      data: page([publication({ document: "https://cid-media.example/fil/p1/doc.pdf" })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.usePublications>);

    renderWithProviders(<FilPage />);

    const lien = screen.getByText(/fil.voir_document/) as HTMLAnchorElement;
    expect(lien.closest("a")).toHaveAttribute("href", "https://cid-media.example/fil/p1/doc.pdf");
  });
});
