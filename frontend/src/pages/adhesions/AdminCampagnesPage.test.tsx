import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useAdhesionsHooks from "../../hooks/useAdhesions";
import type { CampagneAdhesion } from "../../types/adhesion";
import AdminCampagnesPage from "./AdminCampagnesPage";

vi.mock("../../hooks/useAdhesions", async () => {
  const actual = await vi.importActual<typeof useAdhesionsHooks>("../../hooks/useAdhesions");
  return {
    ...actual,
    useCampagnes: vi.fn(),
    useCreerCampagne: vi.fn(),
    usePublierCampagne: vi.fn(),
    useCloturerCampagne: vi.fn(),
  };
});

function campagne(overrides: Partial<CampagneAdhesion> = {}): CampagneAdhesion {
  return {
    id: "c1",
    nom: "Test 2026",
    annee: 2026,
    date_debut: "2026-01-01",
    date_fin: "2026-12-31",
    description: "",
    statut: "brouillon",
    created_by: "m-admin",
    created_at: "2026-01-01T00:00:00Z",
    offres: [],
    ...overrides,
  };
}

function setupMutationMocks(publierMutate = vi.fn(), cloturerMutate = vi.fn(), creerMutate = vi.fn()) {
  vi.mocked(useAdhesionsHooks.useCreerCampagne).mockReturnValue({
    mutate: creerMutate,
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useAdhesionsHooks.useCreerCampagne>);
  vi.mocked(useAdhesionsHooks.usePublierCampagne).mockReturnValue({
    mutate: publierMutate,
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useAdhesionsHooks.usePublierCampagne>);
  vi.mocked(useAdhesionsHooks.useCloturerCampagne).mockReturnValue({
    mutate: cloturerMutate,
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useAdhesionsHooks.useCloturerCampagne>);
}

describe("AdminCampagnesPage", () => {
  it("affiche la liste des campagnes avec le bouton Publier pour un brouillon", () => {
    vi.mocked(useAdhesionsHooks.useCampagnes).mockReturnValue({
      data: { next: null, previous: null, results: [campagne()] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useCampagnes>);
    setupMutationMocks();

    renderWithProviders(<AdminCampagnesPage />);

    expect(screen.getByText("Test 2026")).toBeInTheDocument();
    expect(screen.getByText("admin.publier")).toBeInTheDocument();
    expect(screen.queryByText("admin.cloturer")).not.toBeInTheDocument();
  });

  it("publie une campagne en brouillon", () => {
    const publierMutate = vi.fn();
    vi.mocked(useAdhesionsHooks.useCampagnes).mockReturnValue({
      data: { next: null, previous: null, results: [campagne()] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useCampagnes>);
    setupMutationMocks(publierMutate);

    renderWithProviders(<AdminCampagnesPage />);

    fireEvent.click(screen.getByText("admin.publier"));
    expect(publierMutate).toHaveBeenCalledWith("c1");
  });

  it("demande confirmation avant de clôturer une campagne publiée", () => {
    const cloturerMutate = vi.fn();
    vi.mocked(useAdhesionsHooks.useCampagnes).mockReturnValue({
      data: { next: null, previous: null, results: [campagne({ statut: "publiee" })] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useCampagnes>);
    setupMutationMocks(vi.fn(), cloturerMutate);

    renderWithProviders(<AdminCampagnesPage />);

    fireEvent.click(screen.getByText("admin.cloturer"));
    expect(screen.getByText("admin.confirmer_cloturer_titre")).toBeInTheDocument();

    fireEvent.click(screen.getByText("action.confirmer"));
    expect(cloturerMutate).toHaveBeenCalledTimes(1);
    expect(cloturerMutate.mock.calls[0][0]).toBe("c1");
  });

  it("soumet le formulaire de création avec les champs saisis", () => {
    const creerMutate = vi.fn();
    vi.mocked(useAdhesionsHooks.useCampagnes).mockReturnValue({
      data: { next: null, previous: null, results: [] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useCampagnes>);
    setupMutationMocks(vi.fn(), vi.fn(), creerMutate);

    renderWithProviders(<AdminCampagnesPage />);

    fireEvent.change(screen.getByLabelText("admin.nom_label"), { target: { value: "Campagne 2027" } });
    fireEvent.change(screen.getByLabelText("admin.date_debut_label"), { target: { value: "2027-01-01" } });
    fireEvent.change(screen.getByLabelText("admin.date_fin_label"), { target: { value: "2027-12-31" } });
    fireEvent.click(screen.getByText("admin.creer"));

    expect(creerMutate).toHaveBeenCalledTimes(1);
    expect(creerMutate.mock.calls[0][0]).toMatchObject({
      nom: "Campagne 2027",
      date_debut: "2027-01-01",
      date_fin: "2027-12-31",
    });
  });

  it("déplie la gestion des offres d'une campagne (demande utilisateur du 2026-09-16)", () => {
    vi.mocked(useAdhesionsHooks.useCampagnes).mockReturnValue({
      data: { next: null, previous: null, results: [campagne()] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useCampagnes>);
    setupMutationMocks();

    renderWithProviders(<AdminCampagnesPage />);

    expect(screen.queryByText("admin_offres.titre")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("admin.gerer_offres"));

    expect(screen.getByText("admin_offres.titre")).toBeInTheDocument();
    expect(screen.getByText("admin.masquer_offres")).toBeInTheDocument();
  });
});
