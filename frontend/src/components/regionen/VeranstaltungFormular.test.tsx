import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useRegionen";
import { renderWithProviders } from "../../test/renderWithProviders";
import VeranstaltungFormular from "./VeranstaltungFormular";

vi.mock("../../hooks/useRegionen", () => ({
  useVeranstaltungAnlegen: vi.fn(),
  useVeranstaltungAendern: vi.fn(),
  useVeranstaltungBild: vi.fn(),
}));

const anlegen = vi.fn();

describe("VeranstaltungFormular", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mut = (fn: ReturnType<typeof vi.fn>) => ({ mutate: fn, isPending: false }) as never;
    vi.mocked(hooks.useVeranstaltungAnlegen).mockReturnValue(mut(anlegen));
    vi.mocked(hooks.useVeranstaltungAendern).mockReturnValue(mut(vi.fn()));
    vi.mocked(hooks.useVeranstaltungBild).mockReturnValue(mut(vi.fn()));
  });

  it("verlangt Titel, Datum und Ort und legt einen Entwurf an", () => {
    renderWithProviders(
      <VeranstaltungFormular
        slug="nord"
        standorte={[{ id: "s1", name: "Bremen", land: "HB", aktiv: true }]}
        onFertig={vi.fn()}
      />,
    );
    const knopf = screen.getByText("v_entwurf_speichern");
    expect(knopf).toBeDisabled();
    fireEvent.change(screen.getByLabelText("v_titel"), { target: { value: " Derby " } });
    fireEvent.change(screen.getByLabelText("v_datum"), { target: { value: "2026-11-07" } });
    fireEvent.change(screen.getByLabelText("v_ort"), { target: { value: "Bremen, Pub" } });
    fireEvent.change(screen.getByLabelText("v_max"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("feld_standort"), { target: { value: "s1" } });
    fireEvent.click(knopf);
    expect(anlegen).toHaveBeenCalledWith(
      {
        slug: "nord",
        daten: {
          titel: "Derby",
          datum: "2026-11-07",
          uhrzeit: null,
          ort: "Bremen, Pub",
          standort: "s1",
          max_teilnehmer: 30,
          beschreibung: "",
        },
        bild: null,
      },
      expect.any(Object),
    );
  });
});
