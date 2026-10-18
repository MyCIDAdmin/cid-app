import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../../api/regionen";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { FanProfil } from "../../types/regionen";
import FanKarte from "./FanKarte";

vi.mock("./MitgliedWerdenFormular", () => ({
  default: ({ onAbbrechen }: { onAbbrechen: () => void }) => (
    <button onClick={onAbbrechen}>mw-formular</button>
  ),
}));
vi.mock("../../api/regionen", async () => {
  const actual = await vi.importActual<typeof api>("../../api/regionen");
  return { ...actual, getFanProfil: vi.fn(), getFanOptionen: vi.fn(), aendereFanProfil: vi.fn() };
});

const PROFIL: FanProfil = {
  prenom: "Sami",
  nom: "Ben Ali",
  email: "s@x.de",
  pays: "DE",
  land_de: "HE",
  standort_id: null,
  standort: null,
  region: null,
  mitgliedsantrag_am: null,
  ist_mitglied_in_erwartung: false,
};

describe("FanKarte", () => {
  beforeEach(() => {
    vi.mocked(api.getFanProfil).mockReset().mockResolvedValue(PROFIL);
    vi.mocked(api.getFanOptionen)
      .mockReset()
      .mockResolvedValue({
        laender: [
          { code: "HE", name: "Hessen", region: null },
          { code: "HH", name: "Hamburg", region: { slug: "nord", name: "Nord" } },
        ],
        staaten: [{ code: "DK", name: "Dänemark", region: { slug: "nord", name: "Nord" } }],
        standorte: [{ id: "s1", name: "Hamburg", land: "HH", region: "Nord" }],
      });
    vi.mocked(api.aendereFanProfil)
      .mockReset()
      .mockResolvedValue({ ...PROFIL, land_de: "HH", region: { slug: "nord", name: "Nord" } });
  });

  it("zeigt Begrüßung und fehlende Region", async () => {
    renderWithProviders(<FanKarte />);
    expect(await screen.findByText("fan.begruessung")).toBeInTheDocument();
    expect(screen.getByText(/fan\.keine_region/)).toBeInTheDocument();
  });

  it("ändert Bundesland und Standort", async () => {
    renderWithProviders(<FanKarte />);
    fireEvent.click(await screen.findByText("fan.aendern"));
    fireEvent.change(screen.getByLabelText("fan.bundesland"), { target: { value: "HH" } });
    fireEvent.change(await screen.findByLabelText("fan.standort"), { target: { value: "s1" } });
    fireEvent.click(screen.getByText("fan.speichern"));
    await waitFor(() => expect(api.aendereFanProfil).toHaveBeenCalled());
    expect(vi.mocked(api.aendereFanProfil).mock.calls[0][0]).toEqual({
      prenom: "Sami",
      nom: "Ben Ali",
      pays: "DE",
      land_de: "HH",
      standort: "s1",
    });
  });

  it("wechselt in ein Land außerhalb Deutschlands ohne Bundesland", async () => {
    renderWithProviders(<FanKarte />);
    fireEvent.click(await screen.findByText("fan.aendern"));
    fireEvent.change(screen.getByLabelText("fan.pays"), { target: { value: "DK" } });
    expect(screen.queryByLabelText("fan.bundesland")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("fan.speichern"));
    await waitFor(() => expect(api.aendereFanProfil).toHaveBeenCalled());
    expect(vi.mocked(api.aendereFanProfil).mock.calls[0][0]).toMatchObject({
      pays: "DK",
      land_de: "",
    });
  });

  it("zeigt einen Fehler beim Speichern", async () => {
    vi.mocked(api.aendereFanProfil).mockRejectedValueOnce(new Error("x"));
    renderWithProviders(<FanKarte />);
    fireEvent.click(await screen.findByText("fan.aendern"));
    fireEvent.click(screen.getByText("fan.speichern"));
    expect(await screen.findByText("fan.fehler_speichern")).toBeInTheDocument();
  });

  it("öffnet und schließt das Formular zum Mitglied werden", async () => {
    renderWithProviders(<FanKarte />);
    fireEvent.click(await screen.findByText("fan.mitglied_werden"));
    fireEvent.click(screen.getByText("mw-formular"));
    expect(await screen.findByText("fan.mitglied_werden")).toBeInTheDocument();
  });
});
