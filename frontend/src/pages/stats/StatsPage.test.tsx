import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useStatsHooks from "../../hooks/useStats";
import type { KpisEvenements, KpisFinancier, KpisMembres } from "../../types/stats";
import StatsPage from "./StatsPage";

vi.mock("../../hooks/useStats", async () => {
  const actual = await vi.importActual<typeof useStatsHooks>("../../hooks/useStats");
  return {
    ...actual,
    useStatsFinancier: vi.fn(),
    useStatsMembres: vi.fn(),
    useStatsEvenements: vi.fn(),
  };
});

const financier: KpisFinancier = {
  annee: 2026,
  solde: "160.00",
  recettes: "160.00",
  depenses: "0.00",
  taux_collecte: 86.0,
  cotisations_en_attente: "45.00",
  revenus_boutique: "30.00",
  revenus_adhesions: "50.00",
  revenus_evenements: "15.00",
  top_contributeurs: [
    { membre_id: "m1", nom: "Sana W.", cotisations: "200.00", evenements: "0.00", dons: "0.00", total: "200.00" },
  ],
};

const membres: KpisMembres = {
  total: 312,
  actifs: 300,
  inactifs: 12,
  par_ville: [{ ville_de: "Berlin", nombre: 120 }],
  pyramide_ages: [{ tranche: "26–35 ans", nombre: 40 }],
};

const evenements: KpisEvenements = {
  annee: 2026,
  nombre_evenements: 3,
  taux_remplissage_moyen: 80,
  inscriptions_totales: 42,
  revenus: "630.00",
  par_type: [{ type_evenement: "fete", nombre: 2 }],
  participation_par_evenement: [
    { id: "e1", titre: "Déplacement Stuttgart", places_reservees: 38, places_max: 45 },
  ],
};

describe("StatsPage", () => {
  beforeEach(() => {
    vi.mocked(useStatsHooks.useStatsFinancier).mockReturnValue({
      data: financier,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useStatsHooks.useStatsFinancier>);
    vi.mocked(useStatsHooks.useStatsMembres).mockReturnValue({
      data: membres,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useStatsHooks.useStatsMembres>);
    vi.mocked(useStatsHooks.useStatsEvenements).mockReturnValue({
      data: evenements,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useStatsHooks.useStatsEvenements>);
  });

  it("affiche l'onglet Financier par défaut avec ses KPIs", () => {
    renderWithProviders(<StatsPage />);
    expect(screen.getAllByText("160,00 €")).toHaveLength(2); // solde + recettes
    expect(screen.getByText("Sana W.")).toBeInTheDocument();
  });

  it("bascule vers l'onglet Membres", () => {
    renderWithProviders(<StatsPage />);
    fireEvent.click(screen.getByText("onglets.membres"));
    expect(screen.getByText("312")).toBeInTheDocument();
  });

  it("bascule vers l'onglet Événements", () => {
    renderWithProviders(<StatsPage />);
    fireEvent.click(screen.getByText("onglets.evenements"));
    expect(screen.getByText("Déplacement Stuttgart")).toBeInTheDocument();
  });

  it("transmet le filtre année saisi aux hooks", () => {
    renderWithProviders(<StatsPage />);
    fireEvent.change(screen.getByLabelText("filtres.annee"), { target: { value: "2025" } });
    expect(useStatsHooks.useStatsFinancier).toHaveBeenLastCalledWith(
      expect.objectContaining({ annee: 2025 }),
    );
  });
});
