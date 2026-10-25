import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import { heuteIso } from "../../utils/aktionen";
import AktionStatus, { type AktionStatusDaten } from "./AktionStatus";

function aktion(o: Partial<AktionStatusDaten> = {}): AktionStatusDaten {
  return {
    dringend: false,
    frist: null,
    abgelaufen: false,
    zielbetrag: null,
    gesammelt: "0.00",
    beitragende: 0,
    fortschritt: null,
    ...o,
  };
}

describe("AktionStatus", () => {
  it("zeigt nichts Besonderes ohne Frist, Dringend-Markierung und Ziel", () => {
    renderWithProviders(<AktionStatus aktion={aktion()} />);
    expect(screen.queryByText("aktion.badge_dringend")).not.toBeInTheDocument();
    expect(screen.queryByText(/aktion.gesammelt_von/)).not.toBeInTheDocument();
  });

  it("zeigt das Dringend-Badge", () => {
    renderWithProviders(<AktionStatus aktion={aktion({ dringend: true })} />);
    expect(screen.getByText("aktion.badge_dringend")).toBeInTheDocument();
  });

  it("gilt eine Frist heute als dringend und nennt den letzten Tag", () => {
    renderWithProviders(<AktionStatus aktion={aktion({ frist: heuteIso() })} />);
    expect(screen.getByText("aktion.badge_dringend")).toBeInTheDocument();
    expect(screen.getByText("aktion.frist_heute")).toBeInTheDocument();
  });

  it("markiert abgelaufene Aktionen als beendet und nicht als dringend", () => {
    renderWithProviders(
      <AktionStatus aktion={aktion({ dringend: true, abgelaufen: true, frist: "2020-01-01" })} />,
    );
    expect(screen.getByText("aktion.badge_abgelaufen")).toBeInTheDocument();
    expect(screen.queryByText("aktion.badge_dringend")).not.toBeInTheDocument();
  });

  it("zeigt den Fortschritt und motiviert ab 80 %", () => {
    renderWithProviders(
      <AktionStatus
        aktion={aktion({ zielbetrag: "500.00", gesammelt: "400.00", fortschritt: 80 })}
      />,
    );
    expect(screen.getByText("80 %")).toBeInTheDocument();
    expect(screen.getByText("aktion.fast_geschafft")).toBeInTheDocument();
  });

  it("meldet erreichtes Ziel", () => {
    renderWithProviders(
      <AktionStatus
        aktion={aktion({ zielbetrag: "100.00", gesammelt: "120.00", fortschritt: 100 })}
      />,
    );
    expect(screen.getByText("aktion.ziel_erreicht")).toBeInTheDocument();
    expect(screen.queryByText("aktion.fast_geschafft")).not.toBeInTheDocument();
  });

  it("zeigt ohne Ziel die Summe, sobald es Beiträge gibt, und im kompakten Modus keinen Balken", () => {
    const { rerender } = renderWithProviders(
      <AktionStatus aktion={aktion({ gesammelt: "30.00", beitragende: 2 })} />,
    );
    expect(screen.getByText("aktion.gesammelt_ohne_ziel")).toBeInTheDocument();
    rerender(<AktionStatus aktion={aktion({ gesammelt: "30.00", beitragende: 2 })} kompakt />);
    expect(screen.queryByText("aktion.gesammelt_ohne_ziel")).not.toBeInTheDocument();
  });
});
