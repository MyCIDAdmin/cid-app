import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useAdhesionsHooks from "../../hooks/useAdhesions";
import type { OffreAdhesion } from "../../types/adhesion";
import RabaisManager from "./RabaisManager";

vi.mock("../../hooks/useAdhesions", async () => {
  const actual = await vi.importActual<typeof useAdhesionsHooks>("../../hooks/useAdhesions");
  return {
    ...actual,
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
    rabais: [
      {
        id: "r1",
        offre: "o1",
        type_rabais: "etudiant",
        label_fr: "Réduction étudiant",
        label_de: "",
        label_ar: "",
        montant_reduction: "15.00",
        pct_reduction: null,
        justificatif_requis: true,
        instructions_fr: "Carte étudiante en cours de validité.",
        instructions_de: "",
        instructions_ar: "",
      },
    ],
    ...overrides,
  };
}

function mutationMock<T>(): T {
  return { mutate: vi.fn(), isPending: false, isError: false } as unknown as T;
}

describe("RabaisManager", () => {
  beforeEach(() => {
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

  it("affiche les rabais existants avec leur réduction", () => {
    renderWithProviders(<RabaisManager offre={offre()} />);

    expect(screen.getByText("Réduction étudiant")).toBeInTheDocument();
    expect(screen.getByText("-15.00 €")).toBeInTheDocument();
  });

  it("crée un rabais en montant fixe avec justificatif requis", () => {
    const creerMutate = vi.fn();
    vi.mocked(useAdhesionsHooks.useCreerRabais).mockReturnValue({
      mutate: creerMutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useCreerRabais>);

    renderWithProviders(<RabaisManager offre={offre({ rabais: [] })} />);

    fireEvent.change(screen.getByLabelText("admin_rabais.label_fr_label"), {
      target: { value: "Réduction famille" },
    });
    fireEvent.change(screen.getByLabelText("admin_rabais.valeur_label"), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByText("admin_rabais.ajouter"));

    expect(creerMutate).toHaveBeenCalledTimes(1);
    expect(creerMutate.mock.calls[0][0]).toMatchObject({
      offre: "o1",
      label_fr: "Réduction famille",
      montant_reduction: "10",
      pct_reduction: null,
    });
  });

  it("crée un rabais en pourcentage quand ce type est sélectionné", () => {
    const creerMutate = vi.fn();
    vi.mocked(useAdhesionsHooks.useCreerRabais).mockReturnValue({
      mutate: creerMutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useCreerRabais>);

    renderWithProviders(<RabaisManager offre={offre({ rabais: [] })} />);

    fireEvent.change(screen.getByLabelText("admin_rabais.label_fr_label"), {
      target: { value: "Réduction senior" },
    });
    fireEvent.change(screen.getByLabelText("admin_rabais.valeur_type_label"), {
      target: { value: "pct" },
    });
    fireEvent.change(screen.getByLabelText("admin_rabais.valeur_label"), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByText("admin_rabais.ajouter"));

    expect(creerMutate.mock.calls[0][0]).toMatchObject({
      montant_reduction: null,
      pct_reduction: "10",
    });
  });

  it("supprime un rabais", () => {
    const supprimerMutate = vi.fn();
    vi.mocked(useAdhesionsHooks.useSupprimerRabais).mockReturnValue({
      mutate: supprimerMutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useSupprimerRabais>);

    renderWithProviders(<RabaisManager offre={offre()} />);

    fireEvent.click(screen.getByLabelText("admin_rabais.supprimer — Réduction étudiant"));

    expect(supprimerMutate).toHaveBeenCalledWith("r1");
  });

  it("bascule justificatif_requis sur un rabais existant", () => {
    const modifierMutate = vi.fn();
    vi.mocked(useAdhesionsHooks.useModifierRabais).mockReturnValue({
      mutate: modifierMutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useModifierRabais>);

    renderWithProviders(<RabaisManager offre={offre()} />);

    const checkboxes = screen.getAllByLabelText("admin_rabais.justificatif_requis_label");
    fireEvent.click(checkboxes[0]);

    expect(modifierMutate).toHaveBeenCalledWith({ id: "r1", payload: { justificatif_requis: false } });
  });

  // Même bug de classe que OffresManager (2026-09-24) : désactiver la case à cocher bloque déjà
  // l'interaction réelle, mais ce garde évite tout appel réseau si le handler est malgré tout
  // invoqué (ex. changement forcé programmatique).
  it("en lecture seule (modifiable=false), désactive tout et n'appelle jamais modifierMutation", () => {
    const modifierMutate = vi.fn();
    vi.mocked(useAdhesionsHooks.useModifierRabais).mockReturnValue({
      mutate: modifierMutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useModifierRabais>);

    renderWithProviders(<RabaisManager offre={offre()} modifiable={false} />);

    const checkbox = screen.getAllByLabelText("admin_rabais.justificatif_requis_label")[0];
    expect(checkbox).toBeDisabled();
    fireEvent.click(checkbox);
    expect(modifierMutate).not.toHaveBeenCalled();

    expect(screen.getByLabelText("admin_rabais.supprimer — Réduction étudiant")).toBeDisabled();
    expect(screen.getByText("admin_rabais.ajouter")).toBeDisabled();
  });
});
