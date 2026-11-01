import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import FinancesPage from "./FinancesPage";

vi.mock("../../hooks/useRbac", () => ({
  usePageAccess: () => ({ modifiable: true }),
}));
vi.mock("../../components/finances/CockpitTab", () => ({
  default: ({ onGoto }: { onGoto: (z: string) => void }) => (
    <button onClick={() => onGoto("abschluss")}>cockpit-inhalt</button>
  ),
}));
vi.mock("../../components/finances/AbschlussTab", () => ({
  default: () => <div>abschluss-inhalt</div>,
}));
vi.mock("../../components/finances/DepensesTab", () => ({ default: () => <div>depenses</div> }));
vi.mock("../../components/finances/BudgetTab", () => ({ default: () => <div>budget</div> }));
vi.mock("../../components/finances/CategoriesTab", () => ({ default: () => <div>kat</div> }));
vi.mock("../../components/finances/PruefungTab", () => ({ default: () => <div>pruefung</div> }));
vi.mock("../../components/finances/ProtokollTab", () => ({ default: () => <div>protokoll</div> }));

describe("FinancesPage", () => {
  it("startet im Überblick und der Cockpit-Link wechselt in den Reiter", () => {
    renderWithProviders(<FinancesPage />);
    expect(screen.getByText("cockpit-inhalt")).toBeInTheDocument();
    expect(screen.queryByText("abschluss-inhalt")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("cockpit-inhalt"));
    expect(screen.getByText("abschluss-inhalt")).toBeInTheDocument();
  });
});
