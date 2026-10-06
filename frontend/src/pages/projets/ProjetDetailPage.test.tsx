import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCotisationsHooks from "../../hooks/useCotisations";
import * as useProjetsHooks from "../../hooks/useProjets";
import type { Projet } from "../../types/projets";
import ProjetDetailPage from "./ProjetDetailPage";

// Même convention que ProjetCard.test.tsx : assertions sur les clés i18n brutes.
vi.mock("../../hooks/useProjets", async () => {
  const actual = await vi.importActual<typeof useProjetsHooks>("../../hooks/useProjets");
  return {
    ...actual,
    useProjet: vi.fn(),
    useMisesAJourProjet: vi.fn(),
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
    description_html: "<p>Texte intégral jamais tronqué ici.</p>",
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
    sichtbarkeit: "veroeffentlicht",
    meine_rolle: null,
    darf_arbeitsbereich: false,
    darf_team_verwalten: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderPage() {
  return renderWithProviders(<ProjetDetailPage />, {
    route: "/projets/proj-1",
    path: "/projets/:id",
  });
}

describe("ProjetDetailPage", () => {
  function mockHooksParDefaut() {
    vi.mocked(useProjetsHooks.useMisesAJourProjet).mockReturnValue({
      data: page([]),
      isLoading: false,
    } as unknown as ReturnType<typeof useProjetsHooks.useMisesAJourProjet>);
  }

  it("affiche le titre et la description intégrale (jamais tronquée, contrairement à la kachel)", () => {
    mockHooksParDefaut();
    vi.mocked(useProjetsHooks.useProjet).mockReturnValue({
      data: projet(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useProjetsHooks.useProjet>);

    renderPage();

    expect(screen.getByText("Rénovation du local associatif")).toBeInTheDocument();
    expect(screen.getByText("Texte intégral jamais tronqué ici.")).toBeInTheDocument();
  });

  it("affiche le rapport d'avancement en lecture seule (RapportListe)", () => {
    mockHooksParDefaut();
    vi.mocked(useProjetsHooks.useProjet).mockReturnValue({
      data: projet(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useProjetsHooks.useProjet>);

    renderPage();

    expect(screen.getByText("rapport.aucune_mise_a_jour")).toBeInTheDocument();
    // Jamais de formulaire d'ajout ici — réservé à /admin/projets (voir docstring).
    expect(screen.queryByText("rapport.ajouter")).not.toBeInTheDocument();
  });

  it("ouvre la modale de contribution et navigue vers le paiement après confirmation", () => {
    mockHooksParDefaut();
    vi.mocked(useProjetsHooks.useProjet).mockReturnValue({
      data: projet(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useProjetsHooks.useProjet>);

    const contribuer = mutationMock<ReturnType<typeof useCotisationsHooks.useContribuerProjet>>();
    contribuer.mutate = vi.fn((_payload, options) => {
      options?.onSuccess?.({ id: "cot-1" } as never);
    });
    vi.mocked(useCotisationsHooks.useContribuerProjet).mockReturnValue(contribuer);

    renderPage();

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

  it("ne propose pas de contribuer quand la cagnote n'est pas active", () => {
    mockHooksParDefaut();
    vi.mocked(useProjetsHooks.useProjet).mockReturnValue({
      data: projet({ cagnote_active: false }),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useProjetsHooks.useProjet>);

    renderPage();

    expect(screen.queryByText("cagnote.contribuer")).not.toBeInTheDocument();
  });
});
