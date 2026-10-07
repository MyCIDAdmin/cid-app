import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as usePartnerHooks from "../../hooks/usePartner";
import { renderWithProviders } from "../../test/renderWithProviders";
import ImportPanel from "./ImportPanel";

vi.mock("../../hooks/usePartner", async () => {
  const actual = await vi.importActual<typeof usePartnerHooks>("../../hooks/usePartner");
  return { ...actual, useImportAusgaben: vi.fn() };
});

function setze(data: unknown) {
  const mutate = vi.fn();
  vi.mocked(usePartnerHooks.useImportAusgaben).mockReturnValue({
    mutate,
    data,
    isPending: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof usePartnerHooks.useImportAusgaben>);
  return mutate;
}

describe("ImportPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fordert zuerst nur eine Vorschau an", () => {
    const mutate = setze(undefined);
    renderWithProviders(<ImportPanel onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "import_vorschau" }));
    expect(mutate).toHaveBeenCalledWith(false);
  });

  it("zeigt die Gruppen und bestätigt erst auf Klick", () => {
    const mutate = setze({
      bestaetigt: false,
      gruppen: [
        { name: "Druckerei Meier", anzahl: 3, summe: 40, neu: true },
        { name: "Catering Schmidt", anzahl: 1, summe: 20, neu: false },
      ],
    });
    renderWithProviders(<ImportPanel onClose={() => {}} />);
    expect(screen.getByText("Druckerei Meier")).toBeInTheDocument();
    expect(screen.getByText("import_neu")).toBeInTheDocument();
    expect(screen.getByText("import_vorhanden")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /import_bestaetigen/ }));
    expect(mutate).toHaveBeenCalledWith(true);
  });

  it("meldet, wenn nichts zu importieren ist, und das Ergebnis nach dem Import", () => {
    setze({ bestaetigt: false, gruppen: [] });
    const { unmount } = renderWithProviders(<ImportPanel onClose={() => {}} />);
    expect(screen.getByText("import_nichts")).toBeInTheDocument();
    unmount();
    setze({
      bestaetigt: true,
      partner_neu: 1,
      ausgaben_verknuepft: 4,
      gruppen: [{ name: "Druckerei Meier", anzahl: 4, summe: 40, neu: true }],
    });
    renderWithProviders(<ImportPanel onClose={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent("import_fertig");
    expect(screen.queryByRole("button", { name: /import_bestaetigen/ })).not.toBeInTheDocument();
  });
});
