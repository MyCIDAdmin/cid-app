import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useBoutiqueHooks from "../../hooks/useBoutique";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import type { Produit } from "../../types/boutique";
import type { Tippspiel } from "../../types/communaute";
import TippspielAdminForm from "./TippspielAdminForm";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return { ...actual, useCreerTippspiel: vi.fn(), useModifierTippspiel: vi.fn() };
});

vi.mock("../../hooks/useBoutique", async () => {
  const actual = await vi.importActual<typeof useBoutiqueHooks>("../../hooks/useBoutique");
  return { ...actual, useProduits: vi.fn() };
});

function page<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

function mutationMock<T>(): T {
  return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false } as unknown as T;
}

function produit(overrides: Partial<Produit> = {}): Produit {
  return {
    id: "p1",
    nom: "Maillot officiel Club Africain",
    categorie: "vetements",
    description: "",
    prix: "45.00",
    pourcentage_reduction: null,
    prix_final: "45.00",
    image: null,
    statut: "publie",
    type_produit: "physique",
    nouveaute: false,
    seuil_alerte_stock: 5,
    variantes: [],
    stock_total: 10,
    stock_faible: false,
    en_rupture: false,
    regles_reduction_actives: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function tippspiel(overrides: Partial<Tippspiel> = {}): Tippspiel {
  return {
    id: "tp1",
    titre: "Tippspiel Ligue 1",
    saison: "2026-2027",
    regles: "",
    statut: "brouillon",
    montant_participation: null,
    prix: [],
    created_by_nom: "admin@example.de",
    created_at: "2026-08-01T10:00:00Z",
    maj_le: "2026-08-01T10:00:00Z",
    ...overrides,
  };
}

describe("TippspielAdminForm", () => {
  beforeEach(() => {
    vi.mocked(useBoutiqueHooks.useProduits).mockReturnValue({
      data: page([produit()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useProduits>);
    vi.mocked(useCommunauteHooks.useCreerTippspiel).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useCreerTippspiel>>(),
    );
    vi.mocked(useCommunauteHooks.useModifierTippspiel).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useModifierTippspiel>>(),
    );
  });

  it("crée un Tippspiel avec un lot en pourcentage de la cagnotte", () => {
    const creerMutation = mutationMock<ReturnType<typeof useCommunauteHooks.useCreerTippspiel>>();
    vi.mocked(useCommunauteHooks.useCreerTippspiel).mockReturnValue(creerMutation);

    const onTermine = vi.fn();
    renderWithProviders(<TippspielAdminForm onTermine={onTermine} />);

    fireEvent.change(screen.getByPlaceholderText("tippspiel.admin_titel_placeholder"), {
      target: { value: "Tippspiel Ligue 1 2026-2027" },
    });
    fireEvent.change(screen.getByPlaceholderText("tippspiel.admin_saison_placeholder"), {
      target: { value: "2026-2027" },
    });
    fireEvent.change(screen.getByPlaceholderText("tippspiel.admin_beitrag_placeholder"), {
      target: { value: "10.00" },
    });

    fireEvent.click(screen.getByText("tippspiel.admin_preis_hinzufuegen"));
    // Le type de lot par défaut est "montant_fixe" — bascule sur "pourcentage" via le seul
    // <select> présent à ce stade (aucun lot de type "produit" encore choisi).
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "pourcentage" } });
    fireEvent.change(screen.getByLabelText("tippspiel.admin_preis_prozent_label"), {
      target: { value: "50" },
    });

    fireEvent.click(screen.getByText("tippspiel.admin_erstellen"));

    expect(creerMutation.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        titre: "Tippspiel Ligue 1 2026-2027",
        saison: "2026-2027",
        montant_participation: "10.00",
        prix: [
          expect.objectContaining({ platz: 1, type_prix: "pourcentage", pourcentage: "50" }),
        ],
      }),
      expect.anything(),
    );
  });

  it("propose de choisir un article de la Boutique pour un lot de type produit", () => {
    renderWithProviders(<TippspielAdminForm onTermine={vi.fn()} />);

    fireEvent.click(screen.getByText("tippspiel.admin_preis_hinzufuegen"));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "produit" } });

    expect(screen.getByText("Maillot officiel Club Africain")).toBeInTheDocument();
  });

  it("pré-remplit le formulaire en mode édition et enregistre les modifications", () => {
    const modifierMutation = mutationMock<
      ReturnType<typeof useCommunauteHooks.useModifierTippspiel>
    >();
    vi.mocked(useCommunauteHooks.useModifierTippspiel).mockReturnValue(modifierMutation);

    renderWithProviders(
      <TippspielAdminForm tippspiel={tippspiel({ titre: "Ancien titre" })} onTermine={vi.fn()} />,
    );

    expect(screen.getByDisplayValue("Ancien titre")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("tippspiel.admin_titel_placeholder"), {
      target: { value: "Nouveau titre" },
    });
    fireEvent.click(screen.getByText("tippspiel.admin_speichern"));

    expect(modifierMutation.mutate).toHaveBeenCalledWith(
      { id: "tp1", payload: expect.objectContaining({ titre: "Nouveau titre" }) },
      expect.anything(),
    );
  });

  it("annule et revient à la vue précédente", () => {
    const onTermine = vi.fn();

    renderWithProviders(<TippspielAdminForm onTermine={onTermine} />);
    fireEvent.click(screen.getByText("tippspiel.admin_abbrechen"));

    expect(onTermine).toHaveBeenCalled();
  });
});
