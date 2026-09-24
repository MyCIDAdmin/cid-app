import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useProjetsHooks from "../../hooks/useProjets";
import * as useRbacHooks from "../../hooks/useRbac";
import { useAuthStore } from "../../store/authStore";
import type { Projet } from "../../types/projets";
import AdminProjetsPage from "./AdminProjetsPage";

// page_projets en lecture_ecriture par défaut (task #216) — describe dédié plus bas pour le
// gating lecture seule lui-même. Ne concerne QUE le CRUD du Projet lui-même (titre/statut/...) —
// la gestion du contenu (images/mises à jour, RapportModal) reste régie par
// GestionContenuProjetPermission/est_gestionnaire_projet, hors matrice, voir AdminProjetsPage.tsx.
vi.mock("../../hooks/useRbac", async () => {
  const actual = await vi.importActual<typeof useRbacHooks>("../../hooks/useRbac");
  return { ...actual, usePageAccess: vi.fn() };
});

vi.mock("../../hooks/useProjets", async () => {
  const actual = await vi.importActual<typeof useProjetsHooks>("../../hooks/useProjets");
  return {
    ...actual,
    useProjets: vi.fn(),
    useCreerProjet: vi.fn(),
    useModifierProjet: vi.fn(),
    useSupprimerProjet: vi.fn(),
    useAjouterImageProjet: vi.fn(),
    useSupprimerImageProjet: vi.fn(),
    useMisesAJourProjet: vi.fn(),
    useCreerMiseAJourProjet: vi.fn(),
    useAjouterImageMiseAJourProjet: vi.fn(),
  };
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

function projet(overrides: Partial<Projet> = {}): Projet {
  return {
    id: "proj-1",
    titre: "Rénovation du local associatif",
    description_html: "<p>Texte riche.</p>",
    statut: "en_preparation",
    responsable: null,
    responsable_detail: null,
    cagnote_active: true,
    objectif_montant: "1000.00",
    montant_collecte: "0.00",
    nb_contributeurs: 0,
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

describe("AdminProjetsPage", () => {
  function mockHooksParDefaut() {
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: bureauAdmin,
      isAuthenticated: true,
    });
    vi.mocked(useProjetsHooks.useCreerProjet).mockReturnValue(
      mutationMock<ReturnType<typeof useProjetsHooks.useCreerProjet>>(),
    );
    vi.mocked(useProjetsHooks.useModifierProjet).mockReturnValue(
      mutationMock<ReturnType<typeof useProjetsHooks.useModifierProjet>>(),
    );
    vi.mocked(useProjetsHooks.useSupprimerProjet).mockReturnValue(
      mutationMock<ReturnType<typeof useProjetsHooks.useSupprimerProjet>>(),
    );
    vi.mocked(useProjetsHooks.useAjouterImageProjet).mockReturnValue(
      mutationMock<ReturnType<typeof useProjetsHooks.useAjouterImageProjet>>(),
    );
    vi.mocked(useProjetsHooks.useSupprimerImageProjet).mockReturnValue(
      mutationMock<ReturnType<typeof useProjetsHooks.useSupprimerImageProjet>>(),
    );
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
    vi.mocked(useRbacHooks.usePageAccess).mockReturnValue({
      accessible: true,
      modifiable: true,
      isLoading: false,
    });
  }

  it("affiche la liste des projets avec leur statut, y compris en_preparation (Bureau Admin+)", () => {
    mockHooksParDefaut();
    vi.mocked(useProjetsHooks.useProjets).mockReturnValue({
      data: page([projet()]),
      isLoading: false,
    } as unknown as ReturnType<typeof useProjetsHooks.useProjets>);

    renderWithProviders(<AdminProjetsPage />);

    expect(screen.getByText("Rénovation du local associatif")).toBeInTheDocument();
    expect(screen.getByText("statut.en_preparation")).toBeInTheDocument();
  });

  it("crée un nouveau projet (titre requis) via le formulaire", async () => {
    mockHooksParDefaut();
    vi.mocked(useProjetsHooks.useProjets).mockReturnValue({
      data: page([]),
      isLoading: false,
    } as unknown as ReturnType<typeof useProjetsHooks.useProjets>);
    const creer = mutationMock<ReturnType<typeof useProjetsHooks.useCreerProjet>>();
    creer.mutateAsync = vi.fn().mockResolvedValue(projet({ id: "proj-nouveau" }));
    vi.mocked(useProjetsHooks.useCreerProjet).mockReturnValue(creer);

    renderWithProviders(<AdminProjetsPage />);

    fireEvent.click(screen.getByText("admin.nouveau_projet"));
    const champTitre = screen.getByLabelText(/admin.champ_titre/);
    fireEvent.change(champTitre, { target: { value: "Nouveau projet solidaire" } });
    fireEvent.click(screen.getAllByText("admin.nouveau_projet")[1]);

    await waitFor(() => {
      expect(creer.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ titre: "Nouveau projet solidaire", responsable: null }),
      );
    });
  });

  it("demande confirmation puis supprime un projet", async () => {
    mockHooksParDefaut();
    vi.mocked(useProjetsHooks.useProjets).mockReturnValue({
      data: page([projet()]),
      isLoading: false,
    } as unknown as ReturnType<typeof useProjetsHooks.useProjets>);
    const supprimer = mutationMock<ReturnType<typeof useProjetsHooks.useSupprimerProjet>>();
    vi.mocked(useProjetsHooks.useSupprimerProjet).mockReturnValue(supprimer);

    renderWithProviders(<AdminProjetsPage />);

    fireEvent.click(screen.getByText("admin.supprimer"));
    expect(screen.getByText("admin.confirmer_suppression")).toBeInTheDocument();

    fireEvent.click(screen.getByText("action.confirmer"));

    expect(supprimer.mutate).toHaveBeenCalledWith("proj-1", expect.anything());
  });

  it("ouvre le rapport d'avancement d'un projet depuis la liste", async () => {
    mockHooksParDefaut();
    vi.mocked(useProjetsHooks.useProjets).mockReturnValue({
      data: page([projet()]),
      isLoading: false,
    } as unknown as ReturnType<typeof useProjetsHooks.useProjets>);

    renderWithProviders(<AdminProjetsPage />);

    fireEvent.click(screen.getByText("rapport.voir"));

    await waitFor(() => {
      expect(screen.getByText("rapport.aucune_mise_a_jour")).toBeInTheDocument();
    });
    // Bureau Admin+ est toujours est_gestionnaire (voir est_gestionnaire_projet côté backend) :
    // le formulaire d'ajout de mise à jour est donc déjà visible sans rôle supplémentaire.
    expect(screen.getByText("rapport.publier")).toBeInTheDocument();
  });

  describe("lecture seule (task #216 — page_projets en 'lecture' uniquement)", () => {
    beforeEach(() => {
      mockHooksParDefaut();
      vi.mocked(useRbacHooks.usePageAccess).mockReturnValue({
        accessible: true,
        modifiable: false,
        isLoading: false,
      });
    });

    it("affiche la bannière lecture seule et désactive création/modification/suppression du Projet", () => {
      vi.mocked(useProjetsHooks.useProjets).mockReturnValue({
        data: page([projet()]),
        isLoading: false,
      } as unknown as ReturnType<typeof useProjetsHooks.useProjets>);
      const supprimer = mutationMock<ReturnType<typeof useProjetsHooks.useSupprimerProjet>>();
      vi.mocked(useProjetsHooks.useSupprimerProjet).mockReturnValue(supprimer);

      renderWithProviders(<AdminProjetsPage />);

      expect(screen.getByText("acces.lecture_seule_banniere")).toBeInTheDocument();
      expect(screen.getByText("admin.nouveau_projet")).toBeDisabled();
      expect(screen.getByText("admin.modifier")).toBeDisabled();

      const supprimerBouton = screen.getByText("admin.supprimer");
      expect(supprimerBouton).toBeDisabled();
      fireEvent.click(supprimerBouton);
      expect(supprimer.mutate).not.toHaveBeenCalled();
    });

    it("garde la lecture ET la gestion du contenu (RapportModal) pleinement fonctionnelles — mécanisme distinct de page_projets", async () => {
      vi.mocked(useProjetsHooks.useProjets).mockReturnValue({
        data: page([projet()]),
        isLoading: false,
      } as unknown as ReturnType<typeof useProjetsHooks.useProjets>);

      renderWithProviders(<AdminProjetsPage />);

      expect(screen.getByText("Rénovation du local associatif")).toBeInTheDocument();

      // "Voir le rapport" n'est pas une action d'écriture sur le Projet lui-même — reste actif
      // même en lecture seule sur page_projets, la gestion du contenu (RapportModal) étant régie
      // par GestionContenuProjetPermission/est_gestionnaire_projet, un mécanisme volontairement
      // distinct (voir docstring de AdminProjetsPage.tsx).
      fireEvent.click(screen.getByText("rapport.voir"));

      await waitFor(() => {
        expect(screen.getByText("rapport.aucune_mise_a_jour")).toBeInTheDocument();
      });
      expect(screen.getByText("rapport.publier")).toBeInTheDocument();
    });
  });
});
