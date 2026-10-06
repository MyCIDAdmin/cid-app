import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Projet } from "../../types/projets";
import ProjetsKpiTiles from "./ProjetsKpiTiles";

function projet(overrides: Partial<Projet> = {}): Projet {
  return {
    id: "proj-1",
    titre: "Projet",
    description_html: "",
    statut: "en_cours",
    responsable: null,
    responsable_detail: null,
    cagnote_active: true,
    objectif_montant: "1000.00",
    montant_collecte: "100.00",
    nb_contributeurs: 0,
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

describe("ProjetsKpiTiles", () => {
  it("calcule total/actifs/termines/total_collecte à partir de la liste fournie", () => {
    render(
      <ProjetsKpiTiles
        projets={[
          projet({ id: "p1", statut: "en_cours", montant_collecte: "100.00" }),
          projet({ id: "p2", statut: "en_cours", montant_collecte: "50.00" }),
          projet({ id: "p3", statut: "termine", montant_collecte: "25.00" }),
          projet({ id: "p4", statut: "en_preparation", montant_collecte: "0.00" }),
        ]}
      />,
    );

    expect(screen.getByText("4")).toBeInTheDocument(); // kpi.total
    expect(screen.getByText("2")).toBeInTheDocument(); // kpi.actifs
    expect(screen.getByText("1")).toBeInTheDocument(); // kpi.termines
    expect(screen.getByText("175,00 €")).toBeInTheDocument(); // kpi.total_collecte
  });
});
