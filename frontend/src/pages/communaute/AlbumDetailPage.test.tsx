import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import { useAuthStore } from "../../store/authStore";
import type { Photo } from "../../types/communaute";
import AlbumDetailPage from "./AlbumDetailPage";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return {
    ...actual,
    useAlbum: vi.fn(),
    usePhotos: vi.fn(),
    useLikerPhoto: vi.fn(),
    useMasquerPhoto: vi.fn(),
    useSupprimerPhoto: vi.fn(),
    useCommenterPhoto: vi.fn(),
  };
});

const membre = {
  id: "u1",
  email: "membre@example.com",
  role: "membre" as const,
  langue_preferee: "fr" as const,
};

const admin = { ...membre, id: "u2", role: "bureau_admin" as const };

function page<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

function mutationMock<T>(): T {
  return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false } as unknown as T;
}

function photo(overrides: Partial<Photo> = {}): Photo {
  return {
    id: "p1",
    album: "a1",
    membre: { id: "m1", prenom: "Sana", nom: "Werfelli", photo: null },
    image: "https://cid-media.example.com/photos/p1.jpg",
    legende: "But de la victoire !",
    est_masquee: false,
    created_at: "2026-01-01T10:00:00Z",
    nombre_likes: 4,
    jaime: false,
    est_proprietaire: false,
    commentaires: [],
    ...overrides,
  };
}

function renderDetail() {
  return renderWithProviders(<AlbumDetailPage />, { route: "/albums/a1", path: "/albums/:id" });
}

describe("AlbumDetailPage", () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: "t", refreshToken: "r", user: membre, isAuthenticated: true });
    vi.mocked(useCommunauteHooks.useAlbum).mockReturnValue({
      data: {
        id: "a1",
        nom: "Derby CA - ST 2026",
        description: "",
        date: null,
        lieu: "",
        evenement: null,
        createur: { id: "m1", prenom: "Sana", nom: "Werfelli", photo: null },
        created_at: "2026-01-01T10:00:00Z",
        nombre_photos: 1,
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useAlbum>);
    vi.mocked(useCommunauteHooks.usePhotos).mockReturnValue({
      data: page([photo()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.usePhotos>);
    vi.mocked(useCommunauteHooks.useLikerPhoto).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useLikerPhoto>>(),
    );
    vi.mocked(useCommunauteHooks.useMasquerPhoto).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useMasquerPhoto>>(),
    );
    vi.mocked(useCommunauteHooks.useSupprimerPhoto).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useSupprimerPhoto>>(),
    );
    vi.mocked(useCommunauteHooks.useCommenterPhoto).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useCommenterPhoto>>(),
    );
  });

  it("affiche la grille de photos de l'album", () => {
    renderDetail();

    expect(screen.getByText("Derby CA - ST 2026")).toBeInTheDocument();
    expect(screen.getByAltText("But de la victoire !")).toBeInTheDocument();
  });

  it("affiche la date et le lieu de l'album quand ils sont renseignés", () => {
    vi.mocked(useCommunauteHooks.useAlbum).mockReturnValue({
      data: {
        id: "a1",
        nom: "Derby CA - ST 2026",
        description: "",
        date: "2026-10-03",
        lieu: "Berlin",
        evenement: null,
        createur: { id: "m1", prenom: "Sana", nom: "Werfelli", photo: null },
        created_at: "2026-01-01T10:00:00Z",
        nombre_photos: 1,
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useAlbum>);

    renderDetail();

    expect(screen.getByText("2026-10-03 · Berlin")).toBeInTheDocument();
  });

  it("n'affiche aucun formulaire d'envoi de photo — l'upload est réservé à l'admin", () => {
    renderDetail();
    expect(screen.queryByLabelText("albums.ajouter_photo")).not.toBeInTheDocument();
  });

  it("like une photo", () => {
    const liker = mutationMock<ReturnType<typeof useCommunauteHooks.useLikerPhoto>>();
    vi.mocked(useCommunauteHooks.useLikerPhoto).mockReturnValue(liker);

    renderDetail();

    fireEvent.click(screen.getByText("♥ 4"));

    expect(liker.mutate).toHaveBeenCalledWith("p1");
  });

  it("masque le bouton 'masquer' à un membre standard", () => {
    renderDetail();
    expect(screen.queryByText("albums.masquer")).not.toBeInTheDocument();
  });

  it("propose 'masquer' à un Bureau Admin+ sur la photo d'autrui", () => {
    useAuthStore.setState({ accessToken: "t", refreshToken: "r", user: admin, isAuthenticated: true });
    const masquer = mutationMock<ReturnType<typeof useCommunauteHooks.useMasquerPhoto>>();
    vi.mocked(useCommunauteHooks.useMasquerPhoto).mockReturnValue(masquer);

    renderDetail();

    fireEvent.click(screen.getByText("albums.masquer"));

    expect(masquer.mutate).toHaveBeenCalledWith("p1");
  });

  it("propose 'supprimer' sur sa propre photo", () => {
    vi.mocked(useCommunauteHooks.usePhotos).mockReturnValue({
      data: page([photo({ est_proprietaire: true })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.usePhotos>);

    renderDetail();

    expect(screen.getByText("albums.supprimer")).toBeInTheDocument();
  });
});
