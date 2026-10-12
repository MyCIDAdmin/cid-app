import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as useCotisationsHooks from "../../hooks/useCotisations";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { ImportListenWert } from "../../types/zahlungseingang";
import ImportListenVerwaltung from "./ImportListenVerwaltung";

vi.mock("../../hooks/useCotisations", async () => {
  const actual = await vi.importActual<typeof useCotisationsHooks>("../../hooks/useCotisations");
  return {
    ...actual,
    useImportListenwerte: vi.fn(),
    useImportListenwertSpeichern: vi.fn(),
    useImportListenwertLoeschen: vi.fn(),
  };
});

const speichern = vi.fn();
const loeschen = vi.fn();

function wert(teil: Partial<ImportListenWert>): ImportListenWert {
  return {
    id: "w1",
    liste: "zahlungsart",
    bezeichnung: "Überweisung",
    modus: "virement_sepa",
    aktiv: true,
    reihenfolge: 1,
    ...teil,
  };
}

function einrichten() {
  vi.mocked(useCotisationsHooks.useImportListenwerte).mockImplementation(
    (liste) =>
      ({
        data:
          liste === "zahlungsart"
            ? [wert({}), wert({ id: "w2", bezeichnung: "Karte", modus: "carte", aktiv: false })]
            : [wert({ id: "w3", liste: "verwendungszweck", bezeichnung: "Spende", modus: "" })],
      }) as unknown as ReturnType<typeof useCotisationsHooks.useImportListenwerte>,
  );
  vi.mocked(useCotisationsHooks.useImportListenwertSpeichern).mockReturnValue({
    mutate: speichern,
    isPending: false,
  } as unknown as ReturnType<typeof useCotisationsHooks.useImportListenwertSpeichern>);
  vi.mocked(useCotisationsHooks.useImportListenwertLoeschen).mockReturnValue({
    mutate: loeschen,
    isPending: false,
  } as unknown as ReturnType<typeof useCotisationsHooks.useImportListenwertLoeschen>);
}

describe("ImportListenVerwaltung", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    einrichten();
  });

  it("ist eingeklappt und zeigt beide Listen nach dem Öffnen", () => {
    renderWithProviders(<ImportListenVerwaltung modifiable />);
    expect(screen.queryByText("Überweisung")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /oeffnen/ }));
    expect(screen.getByText("Überweisung")).toBeInTheDocument();
    expect(screen.getByText("Karte")).toBeInTheDocument();
    expect(screen.getByText("Spende")).toBeInTheDocument();
  });

  it("legt einen neuen Zahlungsart-Wert mit Buchungsart an", () => {
    renderWithProviders(<ImportListenVerwaltung modifiable />);
    fireEvent.click(screen.getByRole("button", { name: /oeffnen/ }));
    fireEvent.change(screen.getByLabelText(/neuer_wert_aria.zahlungsart/), {
      target: { value: "Lastschrift" },
    });
    fireEvent.change(screen.getAllByLabelText(/modus_label/)[0], { target: { value: "paypal" } });
    fireEvent.click(screen.getAllByRole("button", { name: /hinzufuegen/ })[0]);
    expect(speichern.mock.calls[0][0]).toEqual({
      payload: {
        liste: "zahlungsart",
        bezeichnung: "Lastschrift",
        modus: "paypal",
        reihenfolge: 3,
      },
    });
  });

  it("deaktiviert und entfernt Werte", () => {
    renderWithProviders(<ImportListenVerwaltung modifiable />);
    fireEvent.click(screen.getByRole("button", { name: /oeffnen/ }));
    fireEvent.click(screen.getAllByRole("button", { name: /deaktivieren/ })[0]);
    expect(speichern.mock.calls[0][0]).toEqual({ id: "w1", payload: { aktiv: false } });
    fireEvent.click(screen.getAllByRole("button", { name: /entfernen/ })[0]);
    expect(loeschen.mock.calls[0][0]).toBe("w1");
  });

  it("zeigt im Lesemodus keine Bearbeitungselemente", () => {
    renderWithProviders(<ImportListenVerwaltung modifiable={false} />);
    fireEvent.click(screen.getByRole("button", { name: /oeffnen/ }));
    expect(screen.getByText("Überweisung")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /hinzufuegen/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /entfernen/ })).not.toBeInTheDocument();
  });
});
