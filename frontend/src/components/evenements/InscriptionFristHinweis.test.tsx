import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Inscription } from "../../types/evenements";
import InscriptionFristHinweis from "./InscriptionFristHinweis";

function inscription(overrides: Partial<Inscription>): Inscription {
  return {
    id: "i1",
    evenement: "e1",
    evenement_detail: null,
    membre: "m1",
    places: 1,
    nombre_accompagnants_adultes: 0,
    nombre_accompagnants_enfants: 0,
    regime_alimentaire: "aucun",
    remarques: "",
    montant_paye: "35.00",
    statut: "confirmee",
    zahlungsfrist_bis: null,
    warteliste_position: null,
    cotisation: null,
    created_at: "2026-10-20T10:00:00Z",
    updated_at: "2026-10-20T10:00:00Z",
    ...overrides,
  };
}

describe("InscriptionFristHinweis", () => {
  it("zeigt die Zahlungsfrist bei offener Zahlung", () => {
    render(
      <InscriptionFristHinweis
        inscription={inscription({
          statut: "en_attente_paiement",
          zahlungsfrist_bis: "2026-10-22T10:00:00Z",
        })}
      />,
    );
    expect(screen.getByText("zahlungsfrist_hinweis")).toBeInTheDocument();
  });

  it("zeigt den Wartelistenplatz", () => {
    render(
      <InscriptionFristHinweis
        inscription={inscription({ statut: "liste_attente", warteliste_position: 3 })}
      />,
    );
    expect(screen.getByText("warteliste_position")).toBeInTheDocument();
  });

  it("zeigt nichts bei bestätigter oder stornierter Anmeldung", () => {
    const { container, rerender } = render(
      <InscriptionFristHinweis inscription={inscription({ statut: "confirmee" })} />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(<InscriptionFristHinweis inscription={inscription({ statut: "annulee" })} />);
    expect(container).toBeEmptyDOMElement();
  });
});
