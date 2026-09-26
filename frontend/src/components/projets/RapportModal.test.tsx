import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useProjetsHooks from "../../hooks/useProjets";
import type { Projet } from "../../types/projets";
import RapportModal from "./RapportModal";

// Même convention que ProjetCard.test.tsx : assertions sur les clés i18n brutes.
vi.mock("../../hooks/useProjets", async () => {
  const actual = await vi.importActual<typeof useProjetsHooks>("../../hooks/useProjets");
  return {
    ...actual,
    useMisesAJourProjet: vi.fn(),
    useCreerMiseAJourProjet: vi.fn(),
    useAjouterImageMiseAJourProjet: vi.fn(),
  };
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
    est_gestionnaire: true,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("RapportModal", () => {
  function mockHooksParDefaut() {
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

  it("n'affiche jamais le formulaire d'ajout quand autoriserAjout=false, même pour un·e gestionnaire du projet (réservé à /admin/projets — voir docstring)", () => {
    mockHooksParDefaut();

    renderWithProviders(
      <RapportModal projet={projet({ est_gestionnaire: true })} onClose={vi.fn()} autoriserAjout={false} />,
    );

    expect(screen.getByText("rapport.aucune_mise_a_jour")).toBeInTheDocument();
    expect(screen.queryByText("rapport.ajouter")).not.toBeInTheDocument();
    expect(screen.queryByText("rapport.publier")).not.toBeInTheDocument();
  });

  it("affiche le formulaire d'ajout quand autoriserAjout=true ET projet.est_gestionnaire", () => {
    mockHooksParDefaut();

    renderWithProviders(
      <RapportModal projet={projet({ est_gestionnaire: true })} onClose={vi.fn()} autoriserAjout={true} />,
    );

    expect(screen.getByText("rapport.ajouter")).toBeInTheDocument();
    expect(screen.getByText("rapport.publier")).toBeInTheDocument();
  });

  it("cache le formulaire d'ajout quand autoriserAjout=true mais que le serveur ne renvoie pas est_gestionnaire", () => {
    mockHooksParDefaut();

    renderWithProviders(
      <RapportModal projet={projet({ est_gestionnaire: false })} onClose={vi.fn()} autoriserAjout={true} />,
    );

    expect(screen.queryByText("rapport.ajouter")).not.toBeInTheDocument();
  });
});
