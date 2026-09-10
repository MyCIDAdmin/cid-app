import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import { useAuthStore } from "../../store/authStore";
import type { CursorPage, MembreListItem } from "../../types/membre";
import * as useMembresHooks from "../../hooks/useMembres";
import MembresListPage from "./MembresListPage";

vi.mock("../../hooks/useMembres", async () => {
  const actual = await vi.importActual<typeof useMembresHooks>("../../hooks/useMembres");
  return {
    ...actual,
    useMembresList: vi.fn(),
    useDeleteMembre: vi.fn(),
  };
});

const membre: MembreListItem = {
  id: "m1",
  numero_membre: "CA-2024-001",
  prenom: "Sami",
  nom: "Ben Salah",
  email: "sami@example.com",
  pays: "DE",
  ville_de: "Berlin",
  land_de: "BE",
  statut: "actif",
  date_adhesion: "2024-01-15",
  cin_masque: "12***78",
};

const page: CursorPage<MembreListItem> = { next: null, previous: null, results: [membre] };

function mockList(overrides: Partial<ReturnType<typeof useMembresHooks.useMembresList>> = {}) {
  vi.mocked(useMembresHooks.useMembresList).mockReturnValue({
    data: page,
    isLoading: false,
    isError: false,
    ...overrides,
  } as ReturnType<typeof useMembresHooks.useMembresList>);
}

describe("MembresListPage", () => {
  beforeEach(() => {
    vi.mocked(useMembresHooks.useDeleteMembre).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useMembresHooks.useDeleteMembre>);
  });

  it("affiche les membres retournés par la liste", () => {
    useAuthStore.setState({
      user: { id: "u1", email: "rh@example.com", role: "rh", langue_preferee: "fr" },
    });
    mockList();

    renderWithProviders(<MembresListPage />);

    expect(screen.getByText("Sami Ben Salah")).toBeInTheDocument();
    expect(screen.getByText("CA-2024-001")).toBeInTheDocument();
    expect(screen.getByText("Berlin")).toBeInTheDocument();
  });

  it("masque les actions de gestion pour un rôle membre", () => {
    useAuthStore.setState({
      user: { id: "u2", email: "membre@example.com", role: "membre", langue_preferee: "fr" },
    });
    mockList();

    renderWithProviders(<MembresListPage />);

    expect(screen.queryByText("liste.modifier")).not.toBeInTheDocument();
    expect(screen.queryByText("liste.supprimer")).not.toBeInTheDocument();
    expect(screen.queryByText(/liste.ajouter/)).not.toBeInTheDocument();
  });

  it("ouvre la confirmation de suppression pour un rôle bureau_admin", () => {
    useAuthStore.setState({
      user: { id: "u3", email: "admin@example.com", role: "bureau_admin", langue_preferee: "fr" },
    });
    mockList();

    renderWithProviders(<MembresListPage />);

    fireEvent.click(screen.getByText("liste.supprimer"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("affiche un état de chargement", () => {
    useAuthStore.setState({
      user: { id: "u1", email: "rh@example.com", role: "rh", langue_preferee: "fr" },
    });
    mockList({ data: undefined, isLoading: true } as never);

    renderWithProviders(<MembresListPage />);
    expect(screen.getByText("liste.chargement")).toBeInTheDocument();
  });
});
