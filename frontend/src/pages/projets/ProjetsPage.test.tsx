import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCotisationsHooks from "../../hooks/useCotisations";
import * as useProjetsHooks from "../../hooks/useProjets";
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

  it("ouvre le rapport d'avancement depuis la kachel (point 7)", async () => {
    mockHooksParDefaut();
    vi.mocked(useProjetsHooks.useProjets).mockReturnValue({
      data: page([projet()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useProjetsHooks.useProjets>);

    renderWithProviders(<ProjetsPage />);

    fireEvent.click(screen.getByText("rapport.voir"));

    await waitFor(() => {
      expect(screen.getByText("rapport.aucune_mise_a_jour")).toBeInTheDocument();
    });
  });

  it("ne propose jamais d'ajouter une mise à jour de rapport ici, même pour un·e gestionnaire du projet (retour utilisateur 2026-09-22 : réservé à /admin/projets)", async () => {
    mockHooksParDefaut();
    vi.mocked(useProjetsHooks.useProjets).mockReturnValue({
      data: page([projet({ est_gestionnaire: true })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useProjetsHooks.useProjets>);

    renderWithProviders(<ProjetsPage />);

    fireEvent.click(screen.getByText("rapport.voir"));

    await waitFor(() => {
      expect(screen.getByText("rapport.aucune_mise_a_jour")).toBeInTheDocument();
    });
    expect(screen.queryByText("rapport.ajouter")).not.toBeInTheDocument();
    expect(screen.queryByText("rapport.publier")).not.toBeInTheDocument();
  });
});
