import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import { useAuthStore } from "../../store/authStore";
import type { Album } from "../../types/communaute";
import AlbumsPage from "./AlbumsPage";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return { ...actual, useAlbums: vi.fn() };
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

function album(overrides: Partial<Album> = {}): Album {
  return {
    id: "a1",
    nom: "Derby CA - ST 2026",
    description: "Photos du derby.",
    date: null,
    lieu: "",
    evenement: null,
    createur: { id: "m1", prenom: "Sana", nom: "Werfelli", photo: null },
    created_at: "2026-01-01T10:00:00Z",
    nombre_photos: 3,
    photo_couverture: null,
    ...overrides,
  };
}

describe("AlbumsPage", () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: membre,
      isAuthenticated: true,
    });
  });

  it("affiche la liste des albums", () => {
    vi.mocked(useCommunauteHooks.useAlbums).mockReturnValue({
      data: page([album()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useAlbums>);

    renderWithProviders(<AlbumsPage />);

    expect(screen.getByText("Derby CA - ST 2026")).toBeInTheDocument();
  });

  it("affiche la date et le lieu d'un album quand ils sont renseignés", () => {
    vi.mocked(useCommunauteHooks.useAlbums).mockReturnValue({
      data: page([album({ date: "2026-10-03", lieu: "Berlin" })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useAlbums>);

    renderWithProviders(<AlbumsPage />);

    expect(screen.getByText("2026-10-03 · Berlin")).toBeInTheDocument();
  });

  it("affiche la bannière de prévisualisation quand l'album a une photo (demande utilisateur 2026-09-25)", () => {
    vi.mocked(useCommunauteHooks.useAlbums).mockReturnValue({
      data: page([album({ photo_couverture: "https://cdn.example.de/albums/a1/cover.jpg" })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useAlbums>);

    const { container } = renderWithProviders(<AlbumsPage />);

    // `alt=""` (image décorative, le titre de l'album porte déjà le nom accessible du lien) —
    // exclue de l'arbre d'accessibilité, donc interrogée directement plutôt que via getByRole.
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://cdn.example.de/albums/a1/cover.jpg",
    );
  });

  it("n'affiche aucune bannière pour un album sans photo", () => {
    vi.mocked(useCommunauteHooks.useAlbums).mockReturnValue({
      data: page([album({ photo_couverture: null })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useAlbums>);

    const { container } = renderWithProviders(<AlbumsPage />);

    expect(container.querySelector("img")).not.toBeInTheDocument();
  });

  it("affiche un message si aucun album", () => {
    vi.mocked(useCommunauteHooks.useAlbums).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useAlbums>);

    renderWithProviders(<AlbumsPage />);

    expect(screen.getByText("albums.aucun_album")).toBeInTheDocument();
  });

  it("n'affiche aucun formulaire de création — l'album est en lecture seule (gestion déplacée vers l'admin)", () => {
    vi.mocked(useCommunauteHooks.useAlbums).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useAlbums>);

    renderWithProviders(<AlbumsPage />);

    expect(screen.queryByText("albums.nouvel_album")).not.toBeInTheDocument();
  });

  describe("partage d'un album (demande utilisateur du 2026-09-23)", () => {
    beforeEach(() => {
      vi.mocked(useCommunauteHooks.useAlbums).mockReturnValue({
        data: page([album()]),
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useCommunauteHooks.useAlbums>);
    });

    it("propose le partage externe de l'album, avec le lien de sa page de détail", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
      Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

      renderWithProviders(<AlbumsPage />);

      fireEvent.click(screen.getByLabelText("partage.bouton_aria"));
      fireEvent.click(screen.getByText("partage.copier_lien"));

      await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
      expect(writeText.mock.calls[0][0]).toContain("/albums/a1");
    });

    it("ne navigue pas vers le détail de l'album au clic sur le bouton de partage", () => {
      Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: vi.fn() },
        configurable: true,
      });

      renderWithProviders(<AlbumsPage />);

      fireEvent.click(screen.getByLabelText("partage.bouton_aria"));

      // Le clic sur le bouton de partage (superposé, en dehors du <Link>) ne doit pas
      // déclencher de navigation vers /albums/a1 : la liste reste affichée.
      expect(screen.queryByTestId("route-fallback")).not.toBeInTheDocument();
      expect(screen.getByText("Derby CA - ST 2026")).toBeInTheDocument();
    });
  });
});
