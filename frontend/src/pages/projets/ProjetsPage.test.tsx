import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCotisationsHooks from "../../hooks/useCotisations";
import * as useProjetsHooks from "../../hooks/useProjets";
import { useAuthStore } from "../../store/authStore";
import type { Projet } from "../../types/projets";
import ProjetsPage from "./ProjetsPage";

// Même convention que ProjetCard.test.tsx : les assertions portent sur les clés i18n brutes
// (traductions jamais résolues dans l'environnement de test jsdom, voir sa docstring).
vi.mock("../../hooks/useProjets", async () => {
  const actual = await vi.importActual<typeof useProjetsHooks>("../../hooks/useProjets");
  return {
    ...actual,
    useProjets: vi.fn(),
    useContributeursProjet: vi.fn(),
    useMisesAJourProjet: vi.fn(),
    useCreerMiseAJourProjet: vi.fn(),
    useAjouterImageMiseAJourProjet: vi.fn(),
  };
});

vi.mock("../../hooks/useCotisations", async () => {
  const actual = await vi.importActual<typeof useCotisationsHooks>("../../hooks/useCotisations");
  return { ...actual, useContribuerProjet: vi.fn() };
});

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

function page<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

function mutationMock<T>(): T {
  return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false } as unknown as T;
}

function projet(overrides: Partial<Projet> = {}): Projet {
  return {
    id: "proj-1",
    titre: "Rénovation du local associatif",
    description_html: "<p>Texte riche.</p>",
    statut: "en_cours",
    responsable: null,
    responsable_detail: null,
    cagnote_active: true,
    objectif_montant: "1000.00",
    montant_collecte: "250.00",
    nb_contributeurs: 2,
    date_limite: null,
    echeance_depassee: false,
    ordre: 0,
    images: [],
    est_gestionnaire: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("ProjetsPage", () => {
  // Cette page est aussi embarquée telle quelle dans l'onglet public "Projekte" (Phase D, page
  // d'accueil publique) : par défaut ici on simule l'usage MEMBRE habituel (authentifié), le
  // comportement visiteur anonyme a son propre test dédié ci-dessous (voir docstring
  // ouvrirContribution dans ProjetsPage.tsx).
  beforeEach(() => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: { id: "u1", email: "m@example.com", role: "membre", langue_preferee: "fr" },
    });
  });

  function mockHooksParDefaut() {
    vi.mocked(useProjetsHooks.useContributeursProjet).mockReturnValue({
      data: undefined,
      isPending: false,
    } as unknown as ReturnType<typeof useProjetsHooks.useContributeursProjet>);
    vi.mocked(useProjetsHooks.useMisesAJourProjet).mockReturnValue({
      data: page([]),
      isLoading: false,
    } as unknown as ReturnType<typeof useProjetsHooks.useMisesAJourProjet>);
    vi.mocked(useProjetsHooks.useCreerMiseAJourProjet).mockReturnValue(
      mutationMock<ReturnType<typeof useProjetsHooks.useCreerMiseAJourProjet>>(),
    );
    vi.mocked(useProjetsHooks.useAjouterImageMiseAJourProjet).mockReturnValue(
      mutationMock<ReturnType<typeof useProjetsHooks.useAjouterImageMiseAJourProjet>>(),
    );
  }

  it("affiche la grille de projets", () => {
    mockHooksParDefaut();
    vi.mocked(useProjetsHooks.useProjets).mockReturnValue({
      data: page([projet()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useProjetsHooks.useProjets>);

    renderWithProviders(<ProjetsPage />);

    expect(screen.getByText("Rénovation du local associatif")).toBeInTheDocument();
  });

  it("affiche un message si aucun projet", () => {
    mockHooksParDefaut();
    vi.mocked(useProjetsHooks.useProjets).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useProjetsHooks.useProjets>);

    renderWithProviders(<ProjetsPage />);

    expect(screen.getByText("page.aucun_projet")).toBeInTheDocument();
  });

  it("ouvre la modale de contribution et confirme (points 2/3), puis navigue vers le paiement", () => {
    mockHooksParDefaut();
    vi.mocked(useProjetsHooks.useProjets).mockReturnValue({
      data: page([projet()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useProjetsHooks.useProjets>);

    const contribuer = mutationMock<ReturnType<typeof useCotisationsHooks.useContribuerProjet>>();
    contribuer.mutate = vi.fn((_payload, options) => {
      options?.onSuccess?.({ id: "cot-1" } as never);
    });
    vi.mocked(useCotisationsHooks.useContribuerProjet).mockReturnValue(contribuer);

    renderWithProviders(<ProjetsPage />);

    fireEvent.click(screen.getByText("cagnote.contribuer"));
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "25" } });
    fireEvent.click(screen.getByText("modal_contribution.confirmer"));

    expect(contribuer.mutate).toHaveBeenCalledWith(
      {
        type_article: "projet",
        projet: "proj-1",
        montant: "25",
        mode_paiement: "virement_sepa",
        libelle: "",
      },
      expect.anything(),
    );
    expect(navigateMock).toHaveBeenCalledWith("/cotisation?paiement=cot-1");
  });

  it("navigue vers la page de détail /projets/:id au clic sur \"Voir le rapport\" (demande utilisateur 2026-09-26 : porter le comportement de mycid.org, page dédiée plutôt que modale)", () => {
    mockHooksParDefaut();
    vi.mocked(useProjetsHooks.useProjets).mockReturnValue({
      data: page([projet()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useProjetsHooks.useProjets>);

    renderWithProviders(<ProjetsPage />);

    fireEvent.click(screen.getByText("rapport.voir"));

    expect(navigateMock).toHaveBeenCalledWith("/projets/proj-1");
  });

  it("affiche les tuiles KPI calculées sur la liste complète, avant tout filtrage", () => {
    mockHooksParDefaut();
    vi.mocked(useProjetsHooks.useProjets).mockReturnValue({
      data: page([
        projet({ id: "p1", statut: "en_cours" }),
        projet({ id: "p2", statut: "termine" }),
      ]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useProjetsHooks.useProjets>);

    renderWithProviders(<ProjetsPage />);

    expect(screen.getByText("kpi.total")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument(); // kpi.total
    expect(screen.getAllByText("1")).toHaveLength(2); // kpi.actifs et kpi.termines
  });

  it("filtre la grille via les onglets All/Active/Completed sans changer les tuiles KPI (demande utilisateur 2026-09-26)", () => {
    mockHooksParDefaut();
    vi.mocked(useProjetsHooks.useProjets).mockReturnValue({
      data: page([
        projet({ id: "p1", titre: "Projet actif", statut: "en_cours" }),
        projet({ id: "p2", titre: "Projet terminé", statut: "termine" }),
      ]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useProjetsHooks.useProjets>);

    renderWithProviders(<ProjetsPage />);

    expect(screen.getByText("Projet actif")).toBeInTheDocument();
    expect(screen.getByText("Projet terminé")).toBeInTheDocument();

    fireEvent.click(screen.getByText("filtre.actifs"));

    expect(screen.getByText("Projet actif")).toBeInTheDocument();
    expect(screen.queryByText("Projet terminé")).not.toBeInTheDocument();
    // Les tuiles KPI restent sur la liste complète, non filtrée (voir docstring ProjetsKpiTiles).
    expect(screen.getByText("kpi.total")).toBeInTheDocument();
  });

  it("renvoie un visiteur anonyme vers /login au clic sur \"Contribuer\" au lieu d'ouvrir la modale (onglet public \"Projekte\", Phase D)", () => {
    mockHooksParDefaut();
    useAuthStore.setState({ isAuthenticated: false, user: null });
    vi.mocked(useProjetsHooks.useProjets).mockReturnValue({
      data: page([projet()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useProjetsHooks.useProjets>);

    renderWithProviders(<ProjetsPage />);

    fireEvent.click(screen.getByText("cagnote.contribuer"));

    expect(navigateMock).toHaveBeenCalledWith("/login");
    expect(screen.queryByText("modal_contribution.confirmer")).not.toBeInTheDocument();
  });
});
