import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useAdhesionsHooks from "../../hooks/useAdhesions";
import type { CampagneAdhesion, OffreAdhesion, Souscription } from "../../types/adhesion";
import MonAdhesionPage from "./MonAdhesionPage";

vi.mock("../../hooks/useAdhesions", async () => {
  const actual = await vi.importActual<typeof useAdhesionsHooks>("../../hooks/useAdhesions");
  return {
    ...actual,
    useCampagneActive: vi.fn(),
    useCampagnes: vi.fn(),
    useMesSouscriptions: vi.fn(),
    useSouscrire: vi.fn(),
  };
});

function offre(overrides: Partial<OffreAdhesion> = {}): OffreAdhesion {
  return {
    id: "o1",
    campagne: "c1",
    nom: "Basic",
    prix_plein: "120.00",
    description: "Adhésion standard",
    avantages: [],
    condition_age_min: null,
    condition_age_max: null,
    visible: true,
    ordre: 1,
    rabais: [
      {
        id: "r1",
        offre: "o1",
        type_rabais: "etudiant",
        label_fr: "Étudiant -20%",
        label_de: "",
        label_ar: "",
        montant_reduction: null,
        pct_reduction: "20.00",
        justificatif_requis: true,
        instructions_fr: "",
        instructions_de: "",
        instructions_ar: "",
      },
    ],
    ...overrides,
  };
}

function campagne(overrides: Partial<CampagneAdhesion> = {}): CampagneAdhesion {
  return {
    id: "c1",
    nom: "Test 2026",
    annee: 2026,
    date_debut: "2026-01-01",
    date_fin: "2026-12-31",
    description: "",
    statut: "publiee",
    created_by: "m-admin",
    created_at: "2026-01-01T00:00:00Z",
    offres: [offre()],
    ...overrides,
  };
}

function souscription(overrides: Partial<Souscription> = {}): Souscription {
  return {
    id: "s1",
    membre: "m1",
    offre: "o1",
    campagne: "c1",
    date_souscription: "2026-02-01T10:00:00Z",
    prix_paye: "96.00",
    rabais: "r1",
    statut: "en_attente_paiement",
    cotisation: null,
    snapshot_avantages: [{ ordre: 1, texte_fr: "Accès complet" }],
    created_at: "2026-02-01T10:00:00Z",
    updated_at: "2026-02-01T10:00:00Z",
    ...overrides,
  };
}

describe("MonAdhesionPage", () => {
  beforeEach(() => {
    vi.mocked(useAdhesionsHooks.useCampagnes).mockReturnValue({
      data: { next: null, previous: null, results: [campagne()] },
    } as unknown as ReturnType<typeof useAdhesionsHooks.useCampagnes>);
  });

  it("affiche un message quand aucune campagne n'est publiée", () => {
    vi.mocked(useAdhesionsHooks.useCampagneActive).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useCampagneActive>);
    vi.mocked(useAdhesionsHooks.useMesSouscriptions).mockReturnValue({
      data: { next: null, previous: null, results: [] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useMesSouscriptions>);
    vi.mocked(useAdhesionsHooks.useSouscrire).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useSouscrire>);

    renderWithProviders(<MonAdhesionPage />);

    expect(screen.getAllByText("offres.aucune_campagne").length).toBeGreaterThan(0);
  });

  it("affiche la carte d'adhésion active et l'historique quand une souscription existe", () => {
    vi.mocked(useAdhesionsHooks.useCampagneActive).mockReturnValue({
      data: campagne(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useCampagneActive>);
    vi.mocked(useAdhesionsHooks.useMesSouscriptions).mockReturnValue({
      data: { next: null, previous: null, results: [souscription()] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useMesSouscriptions>);
    vi.mocked(useAdhesionsHooks.useSouscrire).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useSouscrire>);

    renderWithProviders(<MonAdhesionPage />);

    expect(screen.getByText("hero.titre")).toBeInTheDocument();
    // "Basic" apparaît trois fois : dans la carte d'adhésion active, dans la
    // liste des offres disponibles (changement d'offre toujours permis tant
    // que la souscription n'est pas payée) et dans la ligne d'historique.
    expect(screen.getAllByText("Basic").length).toBe(3);
    // Idem : prix affiché à la fois dans la carte active et l'historique.
    expect(screen.getAllByText("96,00 €").length).toBe(2);
    expect(screen.getByText(/Accès complet/)).toBeInTheDocument();
  });

  it("souscrit avec le rabais sélectionné", () => {
    const mutate = vi.fn();
    vi.mocked(useAdhesionsHooks.useCampagneActive).mockReturnValue({
      data: campagne(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useCampagneActive>);
    vi.mocked(useAdhesionsHooks.useMesSouscriptions).mockReturnValue({
      data: { next: null, previous: null, results: [] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useMesSouscriptions>);
    vi.mocked(useAdhesionsHooks.useSouscrire).mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useSouscrire>);

    renderWithProviders(<MonAdhesionPage />);

    fireEvent.click(screen.getByText("Basic"));
    fireEvent.change(screen.getByLabelText("offres.rabais_label"), { target: { value: "r1" } });
    fireEvent.click(screen.getByText("offres.souscrire"));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toEqual({ offre: "o1", rabais: "r1" });
  });
});
