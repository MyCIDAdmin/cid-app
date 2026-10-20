import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as useZentralHooks from "../../hooks/useZentral";
import { renderWithProviders } from "../../test/renderWithProviders";
import ZentraleEinstellungenPage from "./ZentraleEinstellungenPage";

vi.mock("../../hooks/useZentral", () => ({
  useZentraleEinstellungen: vi.fn(),
  useAendereZentraleEinstellungen: vi.fn(),
}));

describe("ZentraleEinstellungenPage", () => {
  let mutate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mutate = vi.fn();
    vi.mocked(useZentralHooks.useZentraleEinstellungen).mockReturnValue({
      data: {
        warenkorb_reservierung_minuten: 20,
        modifie_par: null,
        updated_at: "x",
      },
      isLoading: false,
      isError: false,
    } as never);
    vi.mocked(useZentralHooks.useAendereZentraleEinstellungen).mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
    } as never);
  });

  it("zeigt den aktuellen Wert und speichert eine Änderung", () => {
    renderWithProviders(<ZentraleEinstellungenPage />);
    const feld = screen.getByLabelText("feld.warenkorb_reservierung_minuten.label");
    expect(feld).toHaveValue(20);
    fireEvent.change(feld, { target: { value: "30" } });
    fireEvent.click(screen.getByText("speichern"));
    expect(mutate).toHaveBeenCalledWith({ warenkorb_reservierung_minuten: 30 }, expect.any(Object));
  });

  it("sperrt Speichern bei ungültigem Wert (0 oder zu groß)", () => {
    renderWithProviders(<ZentraleEinstellungenPage />);
    const feld = screen.getByLabelText("feld.warenkorb_reservierung_minuten.label");
    const knopf = screen.getByText("speichern");
    fireEvent.change(feld, { target: { value: "0" } });
    expect(knopf).toBeDisabled();
    fireEvent.change(feld, { target: { value: "1441" } });
    expect(knopf).toBeDisabled();
    fireEvent.change(feld, { target: { value: "1440" } });
    expect(knopf).toBeEnabled();
  });
});
