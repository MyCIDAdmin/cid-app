import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import * as useRbacHooks from "../../hooks/useRbac";
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

// page_albums en lecture_ecriture par défaut (task #216 — `masquer` exige ce niveau côté backend
// depuis le 2026-09-24, voir PhotoPermission) : ces tests ciblent la modération elle-même
// (peutModerer), pas le gating en lecture seule, déjà couvert dans AdminAlbumsPage.test.tsx.
vi.mock("../../hooks/useRbac", async () => {
  const actual = await vi.importActual<typeof useRbacHooks>("../../hooks/useRbac");
  return { ...actual, usePageAccess: vi.fn() };
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
    vi.mocked(useRbacHooks.usePageAccess).mockReturnValue({
      accessible: true,
      modifiable: true,
      isLoading: false,
    });
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

  it("désactive 'masquer' pour un Bureau Admin+ en lecture seule sur page_albums (task #216)", () => {
    useAuthStore.setState({ accessToken: "t", refreshToken: "r", user: admin, isAuthenticated: true });
    vi.mocked(useRbacHooks.usePageAccess).mockReturnValue({
      accessible: true,
      modifiable: false,
      isLoading: false,
    });
    const masquer = mutationMock<ReturnType<typeof useCommunauteHooks.useMasquerPhoto>>();
    vi.mocked(useCommunauteHooks.useMasquerPhoto).mockReturnValue(masquer);

    renderDetail();

    const bouton = screen.getByText("albums.masquer");
    expect(bouton).toBeDisabled();
    fireEvent.click(bouton);
    expect(masquer.mutate).not.toHaveBeenCalled();
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

  describe("visionneuse plein écran (demande utilisateur du 2026-09-23)", () => {
    it("ouvre la photo en grand au clic sur sa vignette", () => {
      renderDetail();

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      fireEvent.click(screen.getByLabelText("visionneuse.ouvrir"));

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      // La photo apparaît alors deux fois dans le DOM : la vignette de la grille ET la version
      // grand format de la visionneuse.
      expect(screen.getAllByAltText("But de la victoire !")).toHaveLength(2);
    });

    it("navigue vers la photo suivante avec les flèches, sans revenir à la grille", () => {
      vi.mocked(useCommunauteHooks.usePhotos).mockReturnValue({
        data: page([photo({ id: "p1", legende: "Premier but" }), photo({ id: "p2", legende: "Deuxième but" })]),
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useCommunauteHooks.usePhotos>);

      renderDetail();

      fireEvent.click(screen.getAllByLabelText("visionneuse.ouvrir")[0]);
      expect(screen.getAllByAltText("Premier but")).toHaveLength(2);

      fireEvent.click(screen.getByLabelText("visionneuse.image_suivante"));

      expect(screen.getAllByAltText("Deuxième but")).toHaveLength(2);
      expect(screen.getAllByAltText("Premier but")).toHaveLength(1);
    });

    it("se ferme au clic sur le bouton fermer", () => {
      renderDetail();

      fireEvent.click(screen.getByLabelText("visionneuse.ouvrir"));
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText("visionneuse.fermer"));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("propose le partage externe de l'album, avec le lien de sa page de détail", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    renderDetail();

    fireEvent.click(screen.getByLabelText("partage.bouton_aria"));
    fireEvent.click(screen.getByText("partage.copier_lien"));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain("/albums/a1");
  });
});
