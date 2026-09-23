import { screen } from "@testing-library/react";
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
    ...overrides,
  };
}

describe("AlbumsPage", () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: "t", refreshToken: "r", user: membre, isAuthenticated: true });
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
});
