import { fireEvent, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as useFinancesHooks from "../../hooks/useFinances";
import { renderWithProviders } from "../../test/renderWithProviders";
import CockpitTab from "./CockpitTab";
import { cockpit, ladeFinanzTexte } from "./fixtures";

vi.mock("../../hooks/useFinances", async () => {
  const actual = await vi.importActual<typeof useFinancesHooks>("../../hooks/useFinances");
  return { ...actual, useCockpit: vi.fn() };
});

function monter(daten = cockpit(), modifiable = true) {
  vi.mocked(useFinancesHooks.useCockpit).mockReturnValue({
    data: daten,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useFinancesHooks.useCockpit>);
  const onGoto = vi.fn();
  renderWithProviders(<CockpitTab modifiable={modifiable} onGoto={onGoto} />);
  return { onGoto };
}

describe("CockpitTab", () => {
  beforeAll(ladeFinanzTexte);
  beforeEach(() => vi.clearAllMocks());

  it("zeigt die vier Kacheln mit Zahlen und einem Satz dazu", () => {
    monter();
    expect(screen.getByText("Approbations")).toBeInTheDocument();
    expect(screen.getByText("Cotisations ouvertes")).toBeInTheDocument();
    expect(screen.getByText("50 %")).toBeInTheDocument();
    expect(screen.getByText(/l'année est écoulée à 84 %/)).toBeInTheDocument();
    expect(screen.getByText("Tous les justificatifs sont là")).toBeInTheDocument();
  });

  it("zeigt Aufgaben nur für die gewählte Rolle (Finanzen vorgewählt)", () => {
    monter();
    expect(screen.getByText(/Approuver 2 dépenses/)).toBeInTheDocument();
    expect(screen.queryByText(/Confirmer 3 cotisations/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Secrétariat" }));
    expect(screen.getByText(/Confirmer 3 cotisations/)).toBeInTheDocument();
    expect(screen.queryByText(/Approuver 2 dépenses/)).not.toBeInTheDocument();
  });

  it("wählt ohne Schreibrecht die Kassenprüfung vor", () => {
    monter(cockpit(), false);
    expect(screen.getByRole("button", { name: "Contrôle de caisse", pressed: true })).toBeVisible();
  });

  it("führt über den Aufgabenknopf zum Ziel", () => {
    const { onGoto } = monter();
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir les dépenses" }));
    expect(onGoto).toHaveBeenCalledWith("depenses");
  });

  it("zeigt, wenn nichts ansteht, dass alles erledigt ist", () => {
    monter(cockpit({ aufgaben: [] }));
    expect(screen.getByText(/Tout est fait/)).toBeInTheDocument();
  });

  it("zeigt die Prognose als Satz und als Tabelle", () => {
    monter();
    expect(screen.getByText(/on arrive à environ/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /prévision fin d'année/ })).toBeInTheDocument();
  });
});
