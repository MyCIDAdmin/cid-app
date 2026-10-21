import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import * as useRbacHooks from "../../hooks/useRbac";
import { useAuthStore } from "../../store/authStore";
import type { Album } from "../../types/communaute";
import AdminAlbumsPage from "./AdminAlbumsPage";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return {
    ...actual,
    useAlbums: vi.fn(),
    useCreerAlbum: vi.fn(),
    useModifierAlbum: vi.fn(),
    useSupprimerAlbum: vi.fn(),
    usePhotos: vi.fn(),
    useUploaderPhoto: vi.fn(),
    useSupprimerPhoto: vi.fn(),
    useSetzePhotoOeffentlich: vi.fn(),
    useSetzeAlbumFotosOeffentlich: vi.fn(),
  };
});

vi.mock("../../hooks/useAlbumVerknuepfungen", () => ({
  useAlleEvenements: vi.fn(() => ({ data: [{ id: "e1", titre: "Derby Berlin" }] })),
  useAlleProjets: vi.fn(() => ({ data: [{ id: "p1", titre: "Sportplatz Akademie" }] })),
}));

// page_albums en lecture_ecriture par défaut (task #216) — describe dédié plus bas pour le
// gating lecture seule lui-même. Même convention que AdminBoutiquePage.test.tsx.
vi.mock("../../hooks/useRbac", async () => {
  const actual = await vi.importActual<typeof useRbacHooks>("../../hooks/useRbac");
  return { ...actual, usePageAccess: vi.fn() };
});

const bureauAdmin = {
  id: "u1",
  email: "admin@example.com",
  role: "bureau_admin" as const,
  langue_preferee: "fr" as const,
};

function page<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

function mutationMock<T>(): T {
  return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false } as unknown as T;
}

function album(overrides: Partial<Album> = {}): Album {
  return {
    id: "a1",
    nom: "Derby CA - ST 2026",
    description: "Photos du derby.",
    date: null,
    lieu: "",
    evenement: null,
    projet: null,
    oeffentlich: false,
    createur: { id: "m1", prenom: "Sana", nom: "Werfelli", photo: null },
    created_at: "2026-01-01T10:00:00Z",
    nombre_photos: 3,
    photo_couverture: null,
    ...overrides,
  };
}

describe("AdminAlbumsPage", () => {
  function mockHooksParDefaut() {
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: bureauAdmin,
      isAuthenticated: true,
    });
    vi.mocked(useCommunauteHooks.useCreerAlbum).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useCreerAlbum>>(),
    );
    vi.mocked(useCommunauteHooks.useModifierAlbum).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useModifierAlbum>>(),
    );
    vi.mocked(useCommunauteHooks.useSupprimerAlbum).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useSupprimerAlbum>>(),
    );
    vi.mocked(useCommunauteHooks.useUploaderPhoto).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useUploaderPhoto>>(),
    );
    vi.mocked(useCommunauteHooks.useSupprimerPhoto).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useSupprimerPhoto>>(),
    );
    vi.mocked(useCommunauteHooks.usePhotos).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.usePhotos>);
    vi.mocked(useCommunauteHooks.useSetzePhotoOeffentlich).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useSetzePhotoOeffentlich>>(),
    );
    vi.mocked(useCommunauteHooks.useSetzeAlbumFotosOeffentlich).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useSetzeAlbumFotosOeffentlich>>(),
    );
    vi.mocked(useRbacHooks.usePageAccess).mockReturnValue({
      accessible: true,
      modifiable: true,
      isLoading: false,
    });
  }

  it("affiche la liste des albums avec date/lieu et nombre de photos", () => {
    mockHooksParDefaut();
    vi.mocked(useCommunauteHooks.useAlbums).mockReturnValue({
      data: page([album({ date: "2026-10-03", lieu: "Berlin" })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useAlbums>);

    renderWithProviders(<AdminAlbumsPage />);

    expect(screen.getByText("Derby CA - ST 2026")).toBeInTheDocument();
    expect(screen.getByText(/2026-10-03 · Berlin/)).toBeInTheDocument();
  });

  it("crée un nouvel album (nom requis, date/lieu optionnels) via le formulaire", async () => {
    mockHooksParDefaut();
    vi.mocked(useCommunauteHooks.useAlbums).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useAlbums>);
    const creer = mutationMock<ReturnType<typeof useCommunauteHooks.useCreerAlbum>>();
    creer.mutateAsync = vi.fn().mockResolvedValue(album({ id: "a-nouveau" }));
    vi.mocked(useCommunauteHooks.useCreerAlbum).mockReturnValue(creer);

    renderWithProviders(<AdminAlbumsPage />);

    fireEvent.click(screen.getByText("admin_albums.nouvel_album"));
    const champNom = screen.getByLabelText(/admin_albums.champ_nom/);
    fireEvent.change(champNom, { target: { value: "Voyage à Berlin" } });
    const champLieu = screen.getByLabelText("admin_albums.champ_lieu");
    fireEvent.change(champLieu, { target: { value: "Berlin" } });
    fireEvent.click(screen.getAllByText("admin_albums.nouvel_album")[1]);

    await waitFor(() => {
      expect(creer.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ nom: "Voyage à Berlin", lieu: "Berlin" }),
      );
    });
  });

  it("affiche si un album est öffentlich ou nur für Mitglieder und passt ihn per Schalter an", () => {
    mockHooksParDefaut();
    vi.mocked(useCommunauteHooks.useAlbums).mockReturnValue({
      data: page([album({ oeffentlich: false })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useAlbums>);
    const modifier = mutationMock<ReturnType<typeof useCommunauteHooks.useModifierAlbum>>();
    vi.mocked(useCommunauteHooks.useModifierAlbum).mockReturnValue(modifier);

    renderWithProviders(<AdminAlbumsPage />);

    expect(screen.getByText("admin_albums.badge_intern")).toBeInTheDocument();
    fireEvent.click(screen.getByText("admin_albums.freischalten"));

    expect(modifier.mutate).toHaveBeenCalledWith({
      id: "a1",
      payload: { nom: "Derby CA - ST 2026", oeffentlich: true },
    });
  });

  it("verknüpft ein neues Album mit Veranstaltung und Projekt und schaltet es öffentlich frei", async () => {
    mockHooksParDefaut();
    vi.mocked(useCommunauteHooks.useAlbums).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useAlbums>);
    const creer = mutationMock<ReturnType<typeof useCommunauteHooks.useCreerAlbum>>();
    creer.mutateAsync = vi.fn().mockResolvedValue(album({ id: "a-neu" }));
    vi.mocked(useCommunauteHooks.useCreerAlbum).mockReturnValue(creer);

    renderWithProviders(<AdminAlbumsPage />);

    fireEvent.click(screen.getByText("admin_albums.nouvel_album"));
    fireEvent.change(screen.getByLabelText(/admin_albums.champ_nom/), {
      target: { value: "Einweihung" },
    });
    fireEvent.change(screen.getByLabelText("admin_albums.champ_evenement"), {
      target: { value: "e1" },
    });
    fireEvent.change(screen.getByLabelText("admin_albums.champ_projet"), {
      target: { value: "p1" },
    });
    fireEvent.click(screen.getByLabelText(/admin_albums.champ_oeffentlich/));
    fireEvent.click(screen.getAllByText("admin_albums.nouvel_album")[1]);

    await waitFor(() => {
      expect(creer.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          nom: "Einweihung",
          evenement_id: "e1",
          projet_id: "p1",
          oeffentlich: true,
        }),
      );
    });
  });

  describe("Einzelfreigabe der Fotos für die öffentliche Startseite", () => {
    function photo(id: string, oeffentlich: boolean) {
      return {
        id,
        album: "a1",
        membre: { id: "m1", prenom: "Sana", nom: "Werfelli", photo: null },
        image: `https://cdn.example.de/${id}.jpg`,
        legende: id,
        est_masquee: false,
        oeffentlich,
        created_at: "2026-01-01T10:00:00Z",
        nombre_likes: 0,
        jaime: false,
        est_proprietaire: false,
        commentaires: [],
      };
    }

    function oeffneFormular() {
      mockHooksParDefaut();
      vi.mocked(useCommunauteHooks.useAlbums).mockReturnValue({
        data: page([album({ oeffentlich: true })]),
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useCommunauteHooks.useAlbums>);
      vi.mocked(useCommunauteHooks.usePhotos).mockReturnValue({
        data: page([photo("p-frei", true), photo("p-intern", false)]),
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useCommunauteHooks.usePhotos>);
      const einzeln =
        mutationMock<ReturnType<typeof useCommunauteHooks.useSetzePhotoOeffentlich>>();
      const alle =
        mutationMock<ReturnType<typeof useCommunauteHooks.useSetzeAlbumFotosOeffentlich>>();
      vi.mocked(useCommunauteHooks.useSetzePhotoOeffentlich).mockReturnValue(einzeln);
      vi.mocked(useCommunauteHooks.useSetzeAlbumFotosOeffentlich).mockReturnValue(alle);
      renderWithProviders(<AdminAlbumsPage />);
      fireEvent.click(screen.getByText("admin_albums.modifier"));
      return { einzeln, alle };
    }

    it("zeigt je Foto, ob es öffentlich oder nur intern ist", () => {
      oeffneFormular();

      const haken = screen.getAllByLabelText("admin_albums.foto_oeffentlich_aria");
      expect(haken).toHaveLength(2);
      expect(haken[0]).toBeChecked();
      expect(haken[1]).not.toBeChecked();
    });

    it("nimmt ein einzelnes Foto heraus", () => {
      const { einzeln } = oeffneFormular();

      fireEvent.click(screen.getAllByLabelText("admin_albums.foto_oeffentlich_aria")[0]);

      expect(einzeln.mutate).toHaveBeenCalledWith({ id: "p-frei", oeffentlich: false });
    });

    it("gibt alle Fotos auf einmal frei oder nimmt sie heraus", () => {
      const { alle } = oeffneFormular();

      fireEvent.click(screen.getByText("admin_albums.alle_freigeben"));
      fireEvent.click(screen.getByText("admin_albums.alle_intern"));

      expect(alle.mutate).toHaveBeenNthCalledWith(1, { albumId: "a1", oeffentlich: true });
      expect(alle.mutate).toHaveBeenNthCalledWith(2, { albumId: "a1", oeffentlich: false });
    });
  });

  it("demande confirmation puis supprime un album", async () => {
    mockHooksParDefaut();
    vi.mocked(useCommunauteHooks.useAlbums).mockReturnValue({
      data: page([album()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useAlbums>);
    const supprimer = mutationMock<ReturnType<typeof useCommunauteHooks.useSupprimerAlbum>>();
    vi.mocked(useCommunauteHooks.useSupprimerAlbum).mockReturnValue(supprimer);

    renderWithProviders(<AdminAlbumsPage />);

    fireEvent.click(screen.getByText("admin_albums.supprimer"));
    expect(screen.getByText("admin_albums.confirmer_suppression")).toBeInTheDocument();

    fireEvent.click(screen.getByText("action.confirmer"));

    expect(supprimer.mutate).toHaveBeenCalledWith("a1", expect.anything());
  });

  it("ouvre le formulaire d'édition pré-rempli au clic sur Modifier", () => {
    mockHooksParDefaut();
    vi.mocked(useCommunauteHooks.useAlbums).mockReturnValue({
      data: page([album({ date: "2026-10-03", lieu: "Berlin" })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useAlbums>);

    renderWithProviders(<AdminAlbumsPage />);

    fireEvent.click(screen.getByText("admin_albums.modifier"));

    expect(screen.getByText("admin_albums.modifier_album")).toBeInTheDocument();
    expect(screen.getByLabelText(/admin_albums.champ_nom/)).toHaveValue("Derby CA - ST 2026");
    expect(screen.getByLabelText("admin_albums.champ_lieu")).toHaveValue("Berlin");
  });

  it("propose un lien 'Voir' vers la page membre du détail de l'album", () => {
    mockHooksParDefaut();
    vi.mocked(useCommunauteHooks.useAlbums).mockReturnValue({
      data: page([album()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useAlbums>);

    renderWithProviders(<AdminAlbumsPage />);

    expect(screen.getByText("admin_albums.voir").closest("a")).toHaveAttribute(
      "href",
      "/albums/a1",
    );
  });

  describe("lecture seule (task #216 — page_albums en 'lecture' uniquement)", () => {
    beforeEach(() => {
      mockHooksParDefaut();
      vi.mocked(useRbacHooks.usePageAccess).mockReturnValue({
        accessible: true,
        modifiable: false,
        isLoading: false,
      });
    });

    it("affiche la bannière lecture seule et désactive création/modification/suppression", () => {
      vi.mocked(useCommunauteHooks.useAlbums).mockReturnValue({
        data: page([album()]),
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useCommunauteHooks.useAlbums>);
      const supprimer = mutationMock<ReturnType<typeof useCommunauteHooks.useSupprimerAlbum>>();
      vi.mocked(useCommunauteHooks.useSupprimerAlbum).mockReturnValue(supprimer);

      renderWithProviders(<AdminAlbumsPage />);

      expect(screen.getByText("acces.lecture_seule_banniere")).toBeInTheDocument();
      expect(screen.getByText("admin_albums.nouvel_album")).toBeDisabled();
      expect(screen.getByText("admin_albums.modifier")).toBeDisabled();

      const supprimerBouton = screen.getByText("admin_albums.supprimer");
      expect(supprimerBouton).toBeDisabled();
      fireEvent.click(supprimerBouton);
      expect(supprimer.mutate).not.toHaveBeenCalled();
    });

    it("garde la lecture pleinement fonctionnelle (liste des albums)", () => {
      vi.mocked(useCommunauteHooks.useAlbums).mockReturnValue({
        data: page([album({ date: "2026-10-03", lieu: "Berlin" })]),
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useCommunauteHooks.useAlbums>);

      renderWithProviders(<AdminAlbumsPage />);

      expect(screen.getByText("Derby CA - ST 2026")).toBeInTheDocument();
      expect(screen.getByText(/2026-10-03 · Berlin/)).toBeInTheDocument();
    });
  });
});
