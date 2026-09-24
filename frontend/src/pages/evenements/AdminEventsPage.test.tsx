import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useEvenementsHooks from "../../hooks/useEvenements";
import * as useRbacHooks from "../../hooks/useRbac";
import { useAuthStore } from "../../store/authStore";
import type { Evenement } from "../../types/evenements";
import AdminEventsPage from "./AdminEventsPage";

vi.mock("../../hooks/useEvenements", async () => {
  const actual = await vi.importActual<typeof useEvenementsHooks>("../../hooks/useEvenements");
  return {
    ...actual,
    useEvenements: vi.fn(),
    useCreerEvenement: vi.fn(),
    useModifierEvenement: vi.fn(),
    usePublierEvenement: vi.fn(),
    useAnnulerEvenement: vi.fn(),
  };
});

// page_events en lecture_ecriture par défaut (task #216) — describe dédié plus bas pour le
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

function evenement(overrides: Partial<Evenement> = {}): Evenement {
  return {
    id: "e1",
    titre: "Déplacement Stuttgart",
    type_evenement: "deplacement",
    description: "Bus au départ de Berlin.",
    date_evenement: "2099-05-31",
    heure: "06:00",
    lieu: "Mercedes-Benz Arena, Stuttgart",
    point_rdv: "Berlin Hbf",
    places_max: 45,
    gratuit: false,
    cout: "35.00",
    organisateur: "m1",
    organisateur_detail: { id: "m1", prenom: "Sami", nom: "Trabelsi" },
    statut: "brouillon",
    places_reservees: 0,
    places_restantes: 45,
    created_by: "m1",
    created_at: "2026-01-01T10:00:00Z",
    updated_at: "2026-01-01T10:00:00Z",
    ...overrides,
  };
}

describe("AdminEventsPage", () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: bureauAdmin,
      isAuthenticated: true,
    });
    vi.mocked(useEvenementsHooks.useCreerEvenement).mockReturnValue(
      mutationMock<ReturnType<typeof useEvenementsHooks.useCreerEvenement>>(),
    );
    vi.mocked(useEvenementsHooks.useModifierEvenement).mockReturnValue(
      mutationMock<ReturnType<typeof useEvenementsHooks.useModifierEvenement>>(),
    );
    vi.mocked(useEvenementsHooks.usePublierEvenement).mockReturnValue(
      mutationMock<ReturnType<typeof useEvenementsHooks.usePublierEvenement>>(),
    );
    vi.mocked(useEvenementsHooks.useAnnulerEvenement).mockReturnValue(
      mutationMock<ReturnType<typeof useEvenementsHooks.useAnnulerEvenement>>(),
    );
    vi.mocked(useRbacHooks.usePageAccess).mockReturnValue({
      accessible: true,
      modifiable: true,
      isLoading: false,
    });
  });

  it("affiche la liste des événements avec leur statut", () => {
    vi.mocked(useEvenementsHooks.useEvenements).mockReturnValue({
      data: page([evenement()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useEvenements>);

    renderWithProviders(<AdminEventsPage />);

    expect(screen.getByText("Déplacement Stuttgart")).toBeInTheDocument();
  });

  it("crée un nouvel événement", () => {
    const creer = mutationMock<ReturnType<typeof useEvenementsHooks.useCreerEvenement>>();
    vi.mocked(useEvenementsHooks.useCreerEvenement).mockReturnValue(creer);
    vi.mocked(useEvenementsHooks.useEvenements).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useEvenements>);

    renderWithProviders(<AdminEventsPage />);

    fireEvent.click(screen.getByText("admin.creer_evenement"));
    fireEvent.change(screen.getByPlaceholderText("admin.champ_titre_placeholder"), {
      target: { value: "Déplacement Munich" },
    });
    fireEvent.change(screen.getByPlaceholderText("admin.champ_description_placeholder"), {
      target: { value: "Match aller au Bayern." },
    });
    fireEvent.change(screen.getByLabelText("admin.champ_date", { exact: false }), {
      target: { value: "2099-06-14" },
    });
    fireEvent.change(screen.getByPlaceholderText("admin.champ_lieu_placeholder"), {
      target: { value: "Munich" },
    });

    fireEvent.click(screen.getByText("admin.creer_evenement"));

    expect(creer.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        titre: "Déplacement Munich",
        description: "Match aller au Bayern.",
        date_evenement: "2099-06-14",
        lieu: "Munich",
      }),
      expect.anything(),
    );
  });

  it("publie un événement en brouillon", () => {
    const publier = mutationMock<ReturnType<typeof useEvenementsHooks.usePublierEvenement>>();
    vi.mocked(useEvenementsHooks.usePublierEvenement).mockReturnValue(publier);
    vi.mocked(useEvenementsHooks.useEvenements).mockReturnValue({
      data: page([evenement({ statut: "brouillon" })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useEvenements>);

    renderWithProviders(<AdminEventsPage />);

    fireEvent.click(screen.getByText("admin.publier"));

    expect(publier.mutate).toHaveBeenCalledWith("e1", expect.anything());
  });

  it("annule un événement publié", () => {
    const annuler = mutationMock<ReturnType<typeof useEvenementsHooks.useAnnulerEvenement>>();
    vi.mocked(useEvenementsHooks.useAnnulerEvenement).mockReturnValue(annuler);
    vi.mocked(useEvenementsHooks.useEvenements).mockReturnValue({
      data: page([evenement({ statut: "publie" })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useEvenements>);

    renderWithProviders(<AdminEventsPage />);

    fireEvent.click(screen.getByText("admin.annuler_evenement"));

    expect(annuler.mutate).toHaveBeenCalledWith("e1", expect.anything());
  });

  describe("lecture seule (task #216 — page_events en 'lecture' uniquement)", () => {
    beforeEach(() => {
      vi.mocked(useRbacHooks.usePageAccess).mockReturnValue({
        accessible: true,
        modifiable: false,
        isLoading: false,
      });
    });

    it("affiche la bannière lecture seule et désactive création/modification/publication/annulation", () => {
      const publier = mutationMock<ReturnType<typeof useEvenementsHooks.usePublierEvenement>>();
      vi.mocked(useEvenementsHooks.usePublierEvenement).mockReturnValue(publier);
      const annuler = mutationMock<ReturnType<typeof useEvenementsHooks.useAnnulerEvenement>>();
      vi.mocked(useEvenementsHooks.useAnnulerEvenement).mockReturnValue(annuler);
      vi.mocked(useEvenementsHooks.useEvenements).mockReturnValue({
        data: page([evenement({ statut: "brouillon" })]),
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useEvenementsHooks.useEvenements>);

      renderWithProviders(<AdminEventsPage />);

      expect(screen.getByText("acces.lecture_seule_banniere")).toBeInTheDocument();
      expect(screen.getByText("admin.creer_evenement")).toBeDisabled();
      expect(screen.getByText("admin.modifier")).toBeDisabled();

      fireEvent.click(screen.getByText("admin.publier"));
      expect(publier.mutate).not.toHaveBeenCalled();

      fireEvent.click(screen.getByText("admin.annuler_evenement"));
      expect(annuler.mutate).not.toHaveBeenCalled();
    });

    it("garde la lecture pleinement fonctionnelle (liste des événements)", () => {
      vi.mocked(useEvenementsHooks.useEvenements).mockReturnValue({
        data: page([evenement()]),
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useEvenementsHooks.useEvenements>);

      renderWithProviders(<AdminEventsPage />);

      expect(screen.getByText("Déplacement Stuttgart")).toBeInTheDocument();
    });
  });
});
