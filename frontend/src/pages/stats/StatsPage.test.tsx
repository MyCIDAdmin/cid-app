import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as statsApi from "../../api/stats";
import * as useStatsHooks from "../../hooks/useStats";
import type { FinanceRecord, KpisEvenements, KpisFinancier, KpisMembres } from "../../types/stats";
import StatsPage from "./StatsPage";

vi.mock("../../hooks/useStats", async () => {
  const actual = await vi.importActual<typeof useStatsHooks>("../../hooks/useStats");
  return {
    ...actual,
    useStatsFinancier: vi.fn(),
    useStatsMembres: vi.fn(),
    useStatsEvenements: vi.fn(),
    useStatsFinances: vi.fn(),
  };
});

// Export PDF/Excel du dashboard (demande utilisateur du 2026-09-25, module "Statistiken & KPIs" :
// "Export als PDF/Excel-Dashboard") — mockés au niveau du client API, même principe que
// GestionCommandesTab.test.tsx/exporterCommandesExcel : ces fonctions déclenchent un vrai appel
// réseau (axios) hors du périmètre de ce composant.
vi.mock("../../api/stats", async () => {
  const actual = await vi.importActual<typeof statsApi>("../../api/stats");
  return {
    ...actual,
    exporterStatsPdf: vi.fn(),
    exporterStatsExcel: vi.fn(),
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

// Onglet "Finanzdaten" (ajouté le 2026-09-25) — deux lignes de sources différentes pour vérifier
// que le tableau agrège bien plusieurs types de transaction.
const finances: FinanceRecord[] = [
  {
    id: "cotisation:c1",
    type: "cotisation",
    date: "2026-03-01",
    membre_id: "m1",
    membre_nom: "Sana W.",
    description: "Cotisation annuelle 2026",
    montant: "45.00",
    statut: "payee",
  },
  {
    id: "boutique:b1",
    type: "boutique",
    date: "2026-04-10",
    membre_id: "m2",
    membre_nom: "Karim B.",
    description: "Commande #CMD-1",
    montant: "30.00",
    statut: "confirmee",
  },
];

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
    vi.mocked(useStatsHooks.useStatsFinances).mockReturnValue({
      data: { results: finances },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useStatsHooks.useStatsFinances>);
    window.URL.createObjectURL = vi.fn(() => "blob:mock-url");
    window.URL.revokeObjectURL = vi.fn();
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

  describe("filtres Bundesland/Pays/date d'adhésion (demande utilisateur du 2026-09-19)", () => {
    it("affiche les nouveaux champs de filtre", () => {
      renderWithProviders(<StatsPage />);
      expect(screen.getByLabelText("filtres.land")).toBeInTheDocument();
      expect(screen.getByLabelText("filtres.pays")).toBeInTheDocument();
      expect(screen.getByLabelText("filtres.adhesion_apres")).toBeInTheDocument();
      expect(screen.getByLabelText("filtres.adhesion_avant")).toBeInTheDocument();
    });

    it("transmet land/pays/dates aux 3 onglets", () => {
      renderWithProviders(<StatsPage />);
      // Un seul onglet est monté à la fois (voir StatsPage.tsx) — les filtres, eux, sont un état
      // de la page et survivent au changement d'onglet, donc on vérifie chaque hook au fil des
      // bascules plutôt que tous les trois à la fois sur le même rendu.
      const filtresAttendus = expect.objectContaining({
        land: "BE",
        pays: "TN",
        date_adhesion_apres: "2026-01-01",
        date_adhesion_avant: "2026-12-31",
      });

      fireEvent.change(screen.getByLabelText("filtres.land"), { target: { value: "BE" } });
      fireEvent.change(screen.getByLabelText("filtres.pays"), { target: { value: "TN" } });
      fireEvent.change(screen.getByLabelText("filtres.adhesion_apres"), {
        target: { value: "2026-01-01" },
      });
      fireEvent.change(screen.getByLabelText("filtres.adhesion_avant"), {
        target: { value: "2026-12-31" },
      });
      expect(useStatsHooks.useStatsFinancier).toHaveBeenLastCalledWith(filtresAttendus);

      fireEvent.click(screen.getByText("onglets.membres"));
      expect(useStatsHooks.useStatsMembres).toHaveBeenLastCalledWith(filtresAttendus);

      fireEvent.click(screen.getByText("onglets.evenements"));
      expect(useStatsHooks.useStatsEvenements).toHaveBeenLastCalledWith(filtresAttendus);
    });
  });

  describe("onglet Finanzdaten et export PDF/Excel (demande utilisateur du 2026-09-25)", () => {
    it("bascule vers l'onglet Finanzdaten et affiche les lignes de toutes les sources", () => {
      renderWithProviders(<StatsPage />);
      fireEvent.click(screen.getByText("onglets.finances"));
      expect(screen.getByText("Sana W.")).toBeInTheDocument();
      expect(screen.getByText("Karim B.")).toBeInTheDocument();
      expect(screen.getByLabelText("finances.filtre_type")).toBeInTheDocument();
    });

    it("transmet le type de transaction choisi au hook", () => {
      renderWithProviders(<StatsPage />);
      fireEvent.click(screen.getByText("onglets.finances"));
      fireEvent.change(screen.getByLabelText("finances.filtre_type"), {
        target: { value: "boutique" },
      });
      expect(useStatsHooks.useStatsFinances).toHaveBeenLastCalledWith(
        expect.objectContaining({ type_transaction: "boutique" }),
      );
    });

    it("exporte en PDF au clic sur le bouton dédié", async () => {
      const blob = new Blob(["%PDF-1.4"], { type: "application/pdf" });
      vi.mocked(statsApi.exporterStatsPdf).mockResolvedValue(blob);
      renderWithProviders(<StatsPage />);

      fireEvent.click(screen.getByText("export.pdf"));
      await waitFor(() => expect(statsApi.exporterStatsPdf).toHaveBeenCalled());
      expect(window.URL.createObjectURL).toHaveBeenCalledWith(blob);
    });

    it("exporte en Excel au clic sur le bouton dédié", async () => {
      const blob = new Blob(["classeur"]);
      vi.mocked(statsApi.exporterStatsExcel).mockResolvedValue({
        blob,
        nomFichier: "dashboard_stats_2026.xlsx",
      });
      renderWithProviders(<StatsPage />);

      fireEvent.click(screen.getByText("export.excel"));
      await waitFor(() => expect(statsApi.exporterStatsExcel).toHaveBeenCalled());
      expect(window.URL.createObjectURL).toHaveBeenCalledWith(blob);
    });

    it("affiche un message d'erreur si l'export échoue", async () => {
      vi.mocked(statsApi.exporterStatsPdf).mockRejectedValue(new Error("réseau indisponible"));
      renderWithProviders(<StatsPage />);

      fireEvent.click(screen.getByText("export.pdf"));
      await waitFor(() => expect(screen.getByText("export.erreur")).toBeInTheDocument());
    });
  });
});
