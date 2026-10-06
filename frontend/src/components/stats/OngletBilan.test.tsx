import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useStatsHooks from "../../hooks/useStats";
import type { Bilan } from "../../types/stats";
import OngletBilan from "./OngletBilan";

vi.mock("../../hooks/useStats", async () => {
  const actual = await vi.importActual<typeof useStatsHooks>("../../hooks/useStats");
  return { ...actual, useStatsBilan: vi.fn() };
});

// recharts nécessite une taille de conteneur réelle : on le remplace par des coquilles vides.
vi.mock("recharts", () => {
  const Vide = () => null;
  return {
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    ComposedChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Bar: Vide,
    Line: Vide,
    CartesianGrid: Vide,
    Legend: Vide,
    Tooltip: Vide,
    XAxis: Vide,
    YAxis: Vide,
  };
});

const bilan: Bilan = {
  annee: 2026,
  recettes: {
    lignes: [{ cle: "cotisations", montant: "300.00", montant_precedent: "250.00" }],
    total: "300.00",
    total_precedent: "250.00",
  },
  depenses: {
    lignes: [
      {
        categorie_id: "c1",
        nom: "Transport",
        montant: "120.00",
        montant_precedent: "0.00",
        budget: "100.00",
        ecart: "-20.00",
        pourcentage_budget: 120,
        statut_budget: "depasse",
      },
    ],
    total: "120.00",
    total_precedent: "0.00",
    budget_total: "100.00",
  },
  resultat: "180.00",
  resultat_precedent: "250.00",
  mensuel: [{ mois: 1, recettes: "300.00", depenses: "120.00", cumul: "180.00" }],
  depenses_en_attente: { nombre: 2, montant: "75.00" },
  resultats_evenements: [
    { id: "e1", titre: "Fête d'été", recettes: "80.00", depenses: "30.00", resultat: "50.00" },
  ],
  resultats_projets: [],
};

describe("OngletBilan", () => {
  beforeEach(() => {
    vi.mocked(useStatsHooks.useStatsBilan).mockReturnValue({
      data: bilan,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useStatsHooks.useStatsBilan>);
  });

  it("affiche budget dépassé, dépenses en attente et résultat par événement", () => {
    renderWithProviders(<OngletBilan annee={2026} onDrill={vi.fn()} />);
    expect(screen.getByText("bilan.statut_depasse (120 %)")).toBeInTheDocument();
    expect(screen.getByText(/bilan\.en_attente/)).toBeInTheDocument();
    expect(screen.getByText("Fête d'été")).toBeInTheDocument();
  });

  it("ouvre les écritures de dépenses via le lien de drill-down", () => {
    const onDrill = vi.fn();
    renderWithProviders(<OngletBilan annee={2026} onDrill={onDrill} />);
    fireEvent.click(screen.getByText("bilan.voir_depenses"));
    expect(onDrill).toHaveBeenCalledWith({ type: "depense" });
  });
});
