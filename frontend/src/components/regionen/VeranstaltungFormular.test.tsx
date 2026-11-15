import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useRegionen";
import { renderWithProviders } from "../../test/renderWithProviders";
import VeranstaltungFormular from "./VeranstaltungFormular";

vi.mock("../../hooks/useRegionen", () => ({
  useSpiele: vi.fn(),
  useVeranstaltungAnlegen: vi.fn(),
  useVeranstaltungAendern: vi.fn(),
  useVeranstaltungBild: vi.fn(),
  useStandortFuerRegionAnlegen: vi.fn(),
}));

const anlegen = vi.fn();
const standortAnlegen = vi.fn();

describe("VeranstaltungFormular", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hooks.useSpiele).mockReturnValue({ data: [] } as never);
    const mut = (fn: ReturnType<typeof vi.fn>) => ({ mutate: fn, isPending: false }) as never;
    vi.mocked(hooks.useVeranstaltungAnlegen).mockReturnValue(mut(anlegen));
    vi.mocked(hooks.useVeranstaltungAendern).mockReturnValue(mut(vi.fn()));
    vi.mocked(hooks.useVeranstaltungBild).mockReturnValue(mut(vi.fn()));
    vi.mocked(hooks.useStandortFuerRegionAnlegen).mockReturnValue(mut(standortAnlegen));
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
    fireEvent.change(screen.getByLabelText("v_ort_maps_url"), {
      target: { value: " https://maps.app.goo.gl/x " },
    });
    fireEvent.change(screen.getByLabelText("v_max"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("feld_standort"), { target: { value: "s1" } });
    fireEvent.click(screen.getByLabelText("v_ticket_aktiv"));
    fireEvent.click(knopf);
    expect(anlegen).toHaveBeenCalledWith(
      {
        slug: "nord",
        daten: {
          titel: "Derby",
          datum: "2026-11-07",
          uhrzeit: null,
          ort: "Bremen, Pub",
          ort_maps_url: "https://maps.app.goo.gl/x",
          standort: "s1",
          max_teilnehmer: 30,
          ticket_aktiv: true,
          beschreibung: "",
        },
        bild: null,
      },
      expect.any(Object),
    );
  });
  it("legt einen neuen Standort an und wählt ihn aus", () => {
    renderWithProviders(<VeranstaltungFormular slug="nord" standorte={[]} onFertig={vi.fn()} />);
    fireEvent.click(screen.getByText("standort_neu"));
    const feld = screen.getByLabelText("standort_neu_name");
    fireEvent.change(feld, { target: { value: " Kiel " } });
    fireEvent.click(screen.getByText("standort_neu_anlegen"));
    expect(standortAnlegen).toHaveBeenCalledWith({ slug: "nord", name: "Kiel" }, expect.anything());
    const optionen = standortAnlegen.mock.calls[0][1] as { onSuccess: (s: { id: string }) => void };
    act(() => optionen.onSuccess({ id: "neu1" }));
    expect(screen.queryByLabelText("standort_neu_name")).toBeNull();
  });
  it("übernimmt Datum, Uhrzeit und Titel aus dem gewählten Spiel und sperrt die Felder", () => {
    vi.mocked(hooks.useSpiele).mockReturnValue({
      data: [
        {
          id: "sp1",
          titel: "Club Africain – Esperance",
          wettbewerb: "Ligue 1",
          anstoss: "2026-12-05T20:30:00+01:00",
          statut: "SCHEDULED",
        },
      ],
    } as never);
    renderWithProviders(<VeranstaltungFormular slug="nord" standorte={[]} onFertig={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("v_spiel"), { target: { value: "sp1" } });
    expect(screen.getByLabelText("v_datum")).toHaveValue("2026-12-05");
    expect(screen.getByLabelText("v_datum")).toBeDisabled();
    expect(screen.getByLabelText("v_uhrzeit")).toHaveValue("20:30");
    expect(screen.getByLabelText("v_titel")).toHaveValue("Club Africain – Esperance");
    fireEvent.change(screen.getByLabelText("v_ort"), { target: { value: "Bremen, Pub" } });
    fireEvent.click(screen.getByText("v_entwurf_speichern"));
    expect(anlegen).toHaveBeenCalledWith(
      expect.objectContaining({
        daten: expect.objectContaining({ spiel: "sp1", datum: "2026-12-05", uhrzeit: "20:30" }),
      }),
      expect.any(Object),
    );
  });
});
