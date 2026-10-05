import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import type { CampagneAdhesion, OffreAdhesion } from "../../types/adhesion";
import MembershipOffersPublic from "./MembershipOffersPublic";

function offre(overrides: Partial<OffreAdhesion> = {}): OffreAdhesion {
  return {
    id: "o1",
    campagne: "c1",
    nom: "CID Basic",
    prix_plein: "30.00",
    description: "Formule de base",
    avantages: [{ ordre: 1, texte_fr: "Newsletter" }],
    condition_age_min: null,
    condition_age_max: null,
    visible: true,
    ordre: 0,
    icone: null,
    couleur: "",
    populaire: false,
    rabais: [],
    ...overrides,
  };
}

function campagne(offres: OffreAdhesion[]): CampagneAdhesion {
  return {
    id: "c1",
    nom: "Campagne 2026",
    annee: 2026,
    date_debut: "2026-01-01",
    date_fin: "2026-12-31",
    description: "",
    statut: "publiee",

    date_limite_renouvellement: null,

    bascule_non_renouveles_le: null,
    created_by: "m1",
    created_at: "2026-01-01T00:00:00Z",
    offres,
  };
}

describe("MembershipOffersPublic", () => {
  it("n'affiche que les offres visibles, triées par ordre", () => {
    renderWithProviders(
      <MembershipOffersPublic
        campagne={campagne([
          offre({ id: "o2", nom: "CID Plus", ordre: 1 }),
          offre({ id: "o3", nom: "Masquée", visible: false }),
          offre({ id: "o1", nom: "CID Basic", ordre: 0 }),
        ])}
      />,
    );

    expect(screen.queryByText("Masquée")).not.toBeInTheDocument();
    const noms = screen.getAllByText(/CID (Basic|Plus)/).map((el) => el.textContent);
    expect(noms).toEqual(["CID Basic", "CID Plus"]);
  });

  it("affiche le prix et les avantages de chaque offre", () => {
    renderWithProviders(<MembershipOffersPublic campagne={campagne([offre()])} />);
    expect(screen.getByText("30,00 €")).toBeInTheDocument();
    expect(screen.getByText("Newsletter")).toBeInTheDocument();
  });

  it("chaque carte renvoie vers /mon-adhesion", () => {
    renderWithProviders(<MembershipOffersPublic campagne={campagne([offre()])} />);
    expect(screen.getByText("membership.choisir").closest("a")).toHaveAttribute(
      "href",
      "/mon-adhesion",
    );
  });

  it("marque l'offre du milieu comme populaire à partir de 3 offres visibles", () => {
    renderWithProviders(
      <MembershipOffersPublic
        campagne={campagne([
          offre({ id: "o1", nom: "CID Basic", ordre: 0 }),
          offre({ id: "o2", nom: "CID Plus", ordre: 1 }),
          offre({ id: "o3", nom: "CID Gold", ordre: 2 }),
        ])}
      />,
    );
    expect(screen.getByText("membership.badge_populaire")).toBeInTheDocument();
  });

  it("ne rend rien quand aucune offre n'est visible", () => {
    const { container } = renderWithProviders(
      <MembershipOffersPublic campagne={campagne([offre({ visible: false })])} />,
    );
    expect(container.textContent).toBe("");
  });
});
