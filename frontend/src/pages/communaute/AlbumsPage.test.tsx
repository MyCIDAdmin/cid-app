import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import { useAuthStore } from "../../store/authStore";
import type { Album } from "../../types/communaute";
import AlbumsPage from "./AlbumsPage";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return { ...actual, useAlbums: vi.fn(), useCreerAlbum: vi.fn() };
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
    evenement: null,
    createur: { id: "m1", prenom: "Sana", nom: "Werfelli", photo: null },
    created_at: "2026-01-01T10:00:00Z",
    nombre_photos: 3,
    ...overrides,
  };
}

function mutationMock<T>(): T {
  return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false } as unknown as T;
}

describe("AlbumsPage", () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: "t", refreshToken: "r", user: membre, isAuthenticated: true });
    vi.mocked(useCommunauteHooks.useCreerAlbum).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useCreerAlbum>>(),
    );
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

  it("affiche un message si aucun album", () => {
    vi.mocked(useCommunauteHooks.useAlbums).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useAlbums>);

    renderWithProviders(<AlbumsPage />);

    expect(screen.getByText("albums.aucun_album")).toBeInTheDocument();
  });

  it("crée un album — upload collaboratif ouvert à tout membre authentifié", () => {
    const creer = mutationMock<ReturnType<typeof useCommunauteHooks.useCreerAlbum>>();
    vi.mocked(useCommunauteHooks.useCreerAlbum).mockReturnValue(creer);
    vi.mocked(useCommunauteHooks.useAlbums).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useAlbums>);

    renderWithProviders(<AlbumsPage />);

    fireEvent.click(screen.getByText("albums.nouvel_album"));
    fireEvent.change(screen.getByPlaceholderText("albums.nom_placeholder"), {
      target: { value: "Nouvel album" },
    });
    fireEvent.click(screen.getByText("albums.creer"));

    expect(creer.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ nom: "Nouvel album" }),
      expect.anything(),
    );
  });
});
