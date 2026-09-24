import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useAdhesionsHooks from "../../hooks/useAdhesions";
import type { CampagneAdhesion, OffreAdhesion } from "../../types/adhesion";
import OffresManager from "./OffresManager";

vi.mock("../../hooks/useAdhesions", async () => {
  const actual = await vi.importActual<typeof useAdhesionsHooks>("../../hooks/useAdhesions");
  return {
    ...actual,
    useCreerOffre: vi.fn(),
    useModifierOffre: vi.fn(),
    useSupprimerOffre: vi.fn(),
    useCreerRabais: vi.fn(),
    useModifierRabais: vi.fn(),
    useSupprimerRabais: vi.fn(),
  };
});

function offre(overrides: Partial<OffreAdhesion> = {}): OffreAdhesion {
  return {
    id: "o1",
    campagne: "c1",
    nom: "Basic",
    prix_plein: "120.00",
    description: "",
    avantages: [],
    condition_age_min: null,
    condition_age_max: null,
    visible: true,
    ordre: 1,
    rabais: [],
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
    statut: "brouillon",
    created_by: "m-admin",
    created_at: "2026-01-01T00:00:00Z",
    offres: [offre()],
    ...overrides,
  };
}

function mutationMock<T>(): T {
  return { mutate: vi.fn(), isPending: false, isError: false } as unknown as T;
}

describe("OffresManager", () => {
  beforeEach(() => {
    vi.mocked(useAdhesionsHooks.useCreerOffre).mockReturnValue(
      mutationMock<ReturnType<typeof useAdhesionsHooks.useCreerOffre>>(),
    );
    vi.mocked(useAdhesionsHooks.useModifierOffre).mockReturnValue(
      mutationMock<ReturnType<typeof useAdhesionsHooks.useModifierOffre>>(),
    );
    vi.mocked(useAdhesionsHooks.useSupprimerOffre).mockReturnValue(
      mutationMock<ReturnType<typeof useAdhesionsHooks.useSupprimerOffre>>(),
    );
    vi.mocked(useAdhesionsHooks.useCreerRabais).mockReturnValue(
      mutationMock<ReturnType<typeof useAdhesionsHooks.useCreerRabais>>(),
    );
    vi.mocked(useAdhesionsHooks.useModifierRabais).mockReturnValue(
      mutationMock<ReturnType<typeof useAdhesionsHooks.useModifierRabais>>(),
    );
    vi.mocked(useAdhesionsHooks.useSupprimerRabais).mockReturnValue(
      mutationMock<ReturnType<typeof useAdhesionsHooks.useSupprimerRabais>>(),
    );
  });

  it("affiche les offres existantes de la campagne", () => {
    renderWithProviders(<OffresManager campagne={campagne()} />);

    expect(screen.getByText("Basic")).toBeInTheDocument();
  });

  it("crée une nouvelle offre avec les avantages saisis ligne par ligne", () => {
    const creerMutate = vi.fn();
    vi.mocked(useAdhesionsHooks.useCreerOffre).mockReturnValue({
      mutate: creerMutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useCreerOffre>);

    renderWithProviders(<OffresManager campagne={campagne({ offres: [] })} />);

    fireEvent.change(screen.getByLabelText("admin_offres.nom_label"), {
      target: { value: "CID Junior" },
    });
    fireEvent.change(screen.getByLabelText("admin_offres.prix_label"), {
      target: { value: "35.00" },
    });
    fireEvent.change(screen.getByLabelText("admin_offres.avantages_label"), {
      target: { value: "Cadeau de bienvenue\nAdhésion jeune supporter" },
    });
    fireEvent.click(screen.getByText("admin_offres.ajouter"));

    expect(creerMutate).toHaveBeenCalledTimes(1);
    const payload = creerMutate.mock.calls[0][0];
    expect(payload).toMatchObject({ campagne: "c1", nom: "CID Junior", prix_plein: "35.00" });
    expect(payload.avantages).toEqual([
      { ordre: 1, texte_fr: "Cadeau de bienvenue", texte_de: "", texte_ar: "" },
      { ordre: 2, texte_fr: "Adhésion jeune supporter", texte_de: "", texte_ar: "" },
    ]);
  });

  it("supprime une offre", () => {
    const supprimerMutate = vi.fn();
    vi.mocked(useAdhesionsHooks.useSupprimerOffre).mockReturnValue({
      mutate: supprimerMutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useSupprimerOffre>);

    renderWithProviders(<OffresManager campagne={campagne()} />);

    fireEvent.click(screen.getByLabelText("admin_offres.supprimer — Basic"));

    expect(supprimerMutate).toHaveBeenCalledWith("o1");
  });

  it("déplie la gestion des rabais d'une offre", () => {
    renderWithProviders(<OffresManager campagne={campagne()} />);

    expect(screen.queryByText("admin_rabais.titre")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("admin_offres.gerer_rabais"));

    expect(screen.getByText("admin_rabais.titre")).toBeInTheDocument();
  });

  // Bug remonté par l'utilisateur (2026-09-24) : en accès lecture seule sur
  // "page_campagnes_adhesion", le bouton "Neue Kampagne" était bien désactivé, mais les offres
  // d'une campagne EXISTANTE restaient modifiables — ce test couvre exactement ce chemin
  // (jamais exercé jusqu'ici : OffresManager.test.tsx ne testait que modifiable=true par défaut).
  describe("accès lecture seule (modifiable=false)", () => {
    it("désactive le prix, la visibilité et la suppression d'une offre existante", () => {
      renderWithProviders(<OffresManager campagne={campagne()} modifiable={false} />);

      expect(
        screen.getByLabelText("admin_offres.prix_label — Basic"),
      ).toBeDisabled();
      expect(screen.getByLabelText("admin_offres.visible_label")).toBeDisabled();
      expect(screen.getByLabelText("admin_offres.supprimer — Basic")).toBeDisabled();
    });

    it("n'appelle jamais modifierMutation même si on force un changement sur le prix désactivé", () => {
      const modifierMutate = vi.fn();
      vi.mocked(useAdhesionsHooks.useModifierOffre).mockReturnValue({
        mutate: modifierMutate,
        isPending: false,
        isError: false,
      } as unknown as ReturnType<typeof useAdhesionsHooks.useModifierOffre>);

      renderWithProviders(<OffresManager campagne={campagne()} modifiable={false} />);

      const prixInput = screen.getByLabelText("admin_offres.prix_label — Basic");
      fireEvent.change(prixInput, { target: { value: "999.00" } });
      fireEvent.blur(prixInput);

      expect(modifierMutate).not.toHaveBeenCalled();
    });

    it("désactive le formulaire d'ajout d'une nouvelle offre", () => {
      renderWithProviders(<OffresManager campagne={campagne()} modifiable={false} />);

      expect(screen.getByText("admin_offres.ajouter")).toBeDisabled();
    });

    it("laisse tout actif par défaut (modifiable non fourni = true, rétrocompatible)", () => {
      renderWithProviders(<OffresManager campagne={campagne()} />);

      expect(screen.getByLabelText("admin_offres.prix_label — Basic")).not.toBeDisabled();
      expect(screen.getByText("admin_offres.ajouter")).not.toBeDisabled();
    });

    // Suite au retour utilisateur sur le bouton équivalent "Angebote verwalten"
    // (AdminCampagnesPage.test.tsx) : même correctif de libellé ici pour "Gérer les rabais",
    // qui est du même type (dépli d'affichage non désactivé, mais libellé trompeur).
    it("libellé 'voir les rabais' (pas 'gérer') quand modifiable=false, bouton toujours cliquable", () => {
      renderWithProviders(<OffresManager campagne={campagne()} modifiable={false} />);

      expect(screen.queryByText("admin_offres.gerer_rabais")).not.toBeInTheDocument();
      const bouton = screen.getByText("admin_offres.voir_rabais");
      expect(bouton).not.toBeDisabled();

      fireEvent.click(bouton);
      expect(screen.getByText("admin_rabais.titre")).toBeInTheDocument();
    });
  });
});
