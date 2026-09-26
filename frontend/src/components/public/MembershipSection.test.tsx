import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useAdhesionsHooks from "../../hooks/useAdhesions";
import { useAuthStore } from "../../store/authStore";
import type { CampagneAdhesion, Souscription } from "../../types/adhesion";
import MembershipSection from "./MembershipSection";

vi.mock("../../hooks/useAdhesions", async () => {
  const actual = await vi.importActual<typeof useAdhesionsHooks>("../../hooks/useAdhesions");
  return { ...actual, useCampagneActive: vi.fn(), useMesSouscriptions: vi.fn() };
});

function campagneQuery(data: CampagneAdhesion | undefined) {
  return { data, isLoading: false, isError: !data } as unknown as ReturnType<
    typeof useAdhesionsHooks.useCampagneActive
  >;
}

function souscriptionsQuery(results: Souscription[]) {
  return {
    data: { count: results.length, next: null, previous: null, results },
  } as unknown as ReturnType<typeof useAdhesionsHooks.useMesSouscriptions>;
}

function campagne(overrides: Partial<CampagneAdhesion> = {}): CampagneAdhesion {
  return {
    id: "c1",
    nom: "Campagne 2026",
    annee: 2026,
    date_debut: "2026-01-01",
    date_fin: "2026-12-31",
    description: "",
    statut: "publiee",
    created_by: "m1",
    created_at: "2026-01-01T00:00:00Z",
    offres: [
      {
        id: "o1",
        campagne: "c1",
        nom: "CID Basic",
        prix_plein: "30.00",
        description: "",
        avantages: [],
        condition_age_min: null,
        condition_age_max: null,
        visible: true,
        ordre: 0,
        rabais: [],
      },
    ],
    ...overrides,
  };
}

function souscription(overrides: Partial<Souscription> = {}): Souscription {
  return {
    id: "s1",
    membre: "m1",
    offre: "o1",
    campagne: "c1",
    date_souscription: "2026-02-01T00:00:00Z",
    prix_paye: "30.00",
    rabais: null,
    statut: "payee",
    cotisation: null,
    snapshot_avantages: [{ ordre: 1, texte_fr: "Newsletter" }],
    justificatif: null,
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-02-01T00:00:00Z",
    ...overrides,
  };
}

describe("MembershipSection", () => {
  it("ne rend rien tant qu'aucune campagne n'est publiée", () => {
    vi.mocked(useAdhesionsHooks.useCampagneActive).mockReturnValue(campagneQuery(undefined));
    vi.mocked(useAdhesionsHooks.useMesSouscriptions).mockReturnValue(souscriptionsQuery([]));
    useAuthStore.setState({ isAuthenticated: false, user: null });

    const { container } = renderWithProviders(<MembershipSection />);
    expect(container.textContent).toBe("");
  });

  it("affiche les offres publiques pour un visiteur non connecté", () => {
    vi.mocked(useAdhesionsHooks.useCampagneActive).mockReturnValue(campagneQuery(campagne()));
    vi.mocked(useAdhesionsHooks.useMesSouscriptions).mockReturnValue(souscriptionsQuery([]));
    useAuthStore.setState({ isAuthenticated: false, user: null });

    renderWithProviders(<MembershipSection />);
    expect(screen.getByText("membership.choisir")).toBeInTheDocument();
  });

  it("affiche les offres publiques pour un membre connecté sans souscription payée", () => {
    vi.mocked(useAdhesionsHooks.useCampagneActive).mockReturnValue(campagneQuery(campagne()));
    vi.mocked(useAdhesionsHooks.useMesSouscriptions).mockReturnValue(
      souscriptionsQuery([souscription({ statut: "en_attente_paiement" })]),
    );
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: "u1",
        email: "m@example.com",
        role: "membre",
        langue_preferee: "fr",
        statut_membre: "en_attente",
      },
    });

    renderWithProviders(<MembershipSection />);
    expect(screen.getByText("membership.choisir")).toBeInTheDocument();
  });

  it("affiche le récapitulatif \"déjà membre\" quand la souscription de la campagne active est payée", () => {
    vi.mocked(useAdhesionsHooks.useCampagneActive).mockReturnValue(campagneQuery(campagne()));
    vi.mocked(useAdhesionsHooks.useMesSouscriptions).mockReturnValue(
      souscriptionsQuery([souscription()]),
    );
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: "u1",
        email: "m@example.com",
        role: "membre",
        langue_preferee: "fr",
        statut_membre: "en_attente",
      },
    });

    renderWithProviders(<MembershipSection />);
    expect(screen.getByText("membership.deja_membre_titre")).toBeInTheDocument();
    expect(screen.getByText("CID Basic")).toBeInTheDocument();
    expect(screen.getByText("✓ Newsletter")).toBeInTheDocument();
    expect(screen.queryByText("membership.choisir")).not.toBeInTheDocument();
  });
});
