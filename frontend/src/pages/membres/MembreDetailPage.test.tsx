import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import { useAuthStore } from "../../store/authStore";
import type { Membre } from "../../types/membre";
import * as useMembresHooks from "../../hooks/useMembres";
import MembreDetailPage from "./MembreDetailPage";

vi.mock("../../hooks/useMembres", async () => {
  const actual = await vi.importActual<typeof useMembresHooks>("../../hooks/useMembres");
  return {
    ...actual,
    useMembre: vi.fn(),
    useChangerStatutMembre: vi.fn(),
    useDeleteMembre: vi.fn(),
  };
});

const membre: Membre = {
  id: "m1",
  user: null,
  numero_membre: "CA-2024-001",
  prenom: "Sami",
  nom: "Ben Salah",
  date_naissance: "1990-05-01",
  sexe: "homme",
  email: "sami@example.com",
  telephone: "+49 176 0000000",
  cin: "12345678",
  passeport: null,
  pays: "DE",
  adresse_de: "Musterstr. 1",
  code_postal_de: "10115",
  ville_de: "Berlin",
  land_de: "BE",
  ville_origine_tn: "Sfax",
  gouvernorat_tn: "Sfax",
  statut: "actif",
  date_adhesion: "2024-01-15",
  photo: null,
  created_at: "2024-01-15T00:00:00Z",
  updated_at: "2024-01-15T00:00:00Z",
};

describe("MembreDetailPage", () => {
  beforeEach(() => {
    vi.mocked(useMembresHooks.useChangerStatutMembre).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useMembresHooks.useChangerStatutMembre>);
    vi.mocked(useMembresHooks.useDeleteMembre).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useMembresHooks.useDeleteMembre>);
  });

  it("affiche les informations du membre chargé", () => {
    useAuthStore.setState({
      user: { id: "u1", email: "rh@example.com", role: "rh", langue_preferee: "fr" },
    });
    vi.mocked(useMembresHooks.useMembre).mockReturnValue({
      data: membre,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useMembresHooks.useMembre>);

    renderWithProviders(<MembreDetailPage />, { route: "/membres/m1", path: "/membres/:id" });

    expect(screen.getByText("Sami Ben Salah")).toBeInTheDocument();
    expect(screen.getByText("12345678")).toBeInTheDocument();
    expect(screen.getByText("Berlin")).toBeInTheDocument();
  });

  it("affiche un état de chargement", () => {
    useAuthStore.setState({
      user: { id: "u1", email: "rh@example.com", role: "rh", langue_preferee: "fr" },
    });
    vi.mocked(useMembresHooks.useMembre).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useMembresHooks.useMembre>);

    renderWithProviders(<MembreDetailPage />, { route: "/membres/m1", path: "/membres/:id" });
    expect(screen.getByText("liste.chargement")).toBeInTheDocument();
  });

  it("propose 'modifier' à un Membre sur sa propre fiche (AHM-51)", () => {
    useAuthStore.setState({
      user: { id: "u2", email: "membre@example.com", role: "membre", langue_preferee: "fr" },
    });
    vi.mocked(useMembresHooks.useMembre).mockReturnValue({
      data: { ...membre, user: "u2" },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useMembresHooks.useMembre>);

    renderWithProviders(<MembreDetailPage />, { route: "/membres/m1", path: "/membres/:id" });
    expect(screen.getByText("fiche.modifier")).toBeInTheDocument();
  });

  it("ne propose pas 'modifier' à un Membre sur la fiche d'un autre", () => {
    useAuthStore.setState({
      user: { id: "u2", email: "membre@example.com", role: "membre", langue_preferee: "fr" },
    });
    vi.mocked(useMembresHooks.useMembre).mockReturnValue({
      data: { ...membre, user: "un-autre-id" },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useMembresHooks.useMembre>);

    renderWithProviders(<MembreDetailPage />, { route: "/membres/m1", path: "/membres/:id" });
    expect(screen.queryByText("fiche.modifier")).not.toBeInTheDocument();
  });

  it("affiche une erreur si le chargement échoue", () => {
    useAuthStore.setState({
      user: { id: "u1", email: "rh@example.com", role: "rh", langue_preferee: "fr" },
    });
    vi.mocked(useMembresHooks.useMembre).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof useMembresHooks.useMembre>);

    renderWithProviders(<MembreDetailPage />, { route: "/membres/m1", path: "/membres/:id" });
    expect(screen.getByText("fiche.erreur_chargement")).toBeInTheDocument();
  });
});
