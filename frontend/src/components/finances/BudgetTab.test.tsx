import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useFinancesHooks from "../../hooks/useFinances";
import BudgetTab from "./BudgetTab";

vi.mock("../../hooks/useFinances", async () => {
  const actual = await vi.importActual<typeof useFinancesHooks>("../../hooks/useFinances");
  return {
    ...actual,
    useCategories: vi.fn(),
    useBudget: vi.fn(),
    useBudgetUebersicht: vi.fn(),
    useDefinirBudget: vi.fn(),
    useGesamtbudgetSetzen: vi.fn(),
  };
});

const KATEGORIEN = [
  { id: "c1", nom: "Transport", nom_de: "", nom_ar: "", actif: true, ordre: 0 },
  {
    id: "c2",
    nom: "Projets",
    nom_de: "Projekte",
    nom_ar: "",
    actif: true,
    ordre: 1,
    projektbudget: true,
  },
];

function monter(gesamt = "1000.00") {
  vi.mocked(useFinancesHooks.useCategories).mockReturnValue({
    data: KATEGORIEN,
  } as unknown as ReturnType<typeof useFinancesHooks.useCategories>);
  vi.mocked(useFinancesHooks.useBudget).mockReturnValue({
    data: [],
  } as unknown as ReturnType<typeof useFinancesHooks.useBudget>);
  vi.mocked(useFinancesHooks.useBudgetUebersicht).mockReturnValue({
    data: {
      annee: 2026,
      gesamt,
      zugeteilt: "0.00",
      verfuegbar: gesamt,
      projekte: { kategorie: "c2", budget: "0.00", geplant: "0.00", verfuegbar: "0.00" },
    },
  } as unknown as ReturnType<typeof useFinancesHooks.useBudgetUebersicht>);
  vi.mocked(useFinancesHooks.useDefinirBudget).mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useFinancesHooks.useDefinirBudget>);
  vi.mocked(useFinancesHooks.useGesamtbudgetSetzen).mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useFinancesHooks.useGesamtbudgetSetzen>);
  renderWithProviders(<BudgetTab modifiable />);
}

describe("BudgetTab", () => {
  beforeEach(() => vi.clearAllMocks());

  it("zeigt das verfügbare Budget und zieht Kategorie-Budgets vom Gesamtbudget ab", () => {
    monter();
    fireEvent.change(screen.getByLabelText("Transport"), { target: { value: "300" } });
    expect(screen.getByText("700,00 €")).toBeInTheDocument();
  });

  it("warnt und sperrt das Speichern bei Überschreitung des Gesamtbudgets", () => {
    monter("200.00");
    fireEvent.change(screen.getByLabelText("Transport"), { target: { value: "250" } });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "budget.enregistrer" })).toBeDisabled();
  });
});
