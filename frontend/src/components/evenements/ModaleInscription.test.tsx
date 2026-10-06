import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useEvenementsHooks from "../../hooks/useEvenements";
import type { Evenement } from "../../types/evenements";
import ModaleInscription from "./ModaleInscription";

vi.mock("../../hooks/useEvenements", async () => {
  const actual = await vi.importActual<typeof useEvenementsHooks>("../../hooks/useEvenements");
  return { ...actual, useInscrire: vi.fn() };
});

function evenement(overrides: Partial<Evenement> = {}): Evenement {
  return {
    id: "ev1",
    titre: "Sortie supporters",
    type_evenement: "deplacement",
    description: "Déplacement collectif.",
    date_evenement: "2026-12-01",
    heure: "18:00:00",
    date_fin: null,
    heure_fin: null,
    date_limite_paiement: null,
    lieu: "Alexanderplatz, Berlin",
    point_rdv: "",
    lieu_maps_url: "https://share.google/abc123",
    image: null,
    places_max: 20,
    gratuit: true,
    cout: "0.00",
    cout_non_membre: null,
    cout_applicable: "0.00",
    reserve_membres: false,
    accompagnants_payants: false,
    prix_accompagnant_adulte: "0.00",
    prix_accompagnant_enfant: "0.00",
    age_limite_accompagnant_enfant: 12,
    organisateur: null,
    organisateur_detail: null,
    statut: "publie",
    visible_public: true,
    places_reservees: 5,
    places_restantes: 15,
    created_by: "m1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("ModaleInscription", () => {
  it("affiche l'aperçu Maps du lieu de l'événement (demande utilisateur 2026-09-27, point 11.2)", () => {
    vi.mocked(useEvenementsHooks.useInscrire).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useInscrire>);

    renderWithProviders(
      <ModaleInscription evenement={evenement()} onClose={vi.fn()} onPayer={vi.fn()} />,
    );

    expect(screen.getByText("Alexanderplatz, Berlin")).toBeInTheDocument();
    expect(screen.getByText("maps.ouvrir").closest("a")).toHaveAttribute(
      "href",
      "https://share.google/abc123",
    );
  });

  it("n'affiche pas de lien Maps quand l'événement n'en a pas", () => {
    vi.mocked(useEvenementsHooks.useInscrire).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useInscrire>);

    renderWithProviders(
      <ModaleInscription
        evenement={evenement({ lieu_maps_url: "" })}
        onClose={vi.fn()}
        onPayer={vi.fn()}
      />,
    );

    expect(screen.queryByText("maps.ouvrir")).not.toBeInTheDocument();
  });
});
