import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useRegionen";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { Verwaltung } from "../../types/regionen";
import AdminRegionenPage from "./AdminRegionenPage";

vi.mock("../../hooks/useRegionen", () => ({
  useVerwaltung: vi.fn(),
  useRegionAnlegen: vi.fn(),
  useRegionAendern: vi.fn(),
  useRegionLoeschen: vi.fn(),
  useLaenderSetzen: vi.fn(),
  useStandortAnlegen: vi.fn(),
  useStandortLoeschen: vi.fn(),
  useStaatenSetzen: vi.fn(),
}));

const daten: Verwaltung = {
  laender: [
    { code: "HH", name: "Hamburg" },
    { code: "HE", name: "Hessen" },
  ],
  ohne_region: ["HE"],
  staaten: [
    { code: "DK", name: "Dänemark" },
    { code: "FR", name: "Frankreich" },
  ],
  staaten_ohne_region: ["FR"],
  ergebnisse: [
    {
      id: "r1",
      slug: "nord",
      name: "Nord",
      farbe: "#0e7490",
      reihenfolge: 1,
      aktiv: true,
      mitglieder: 4,
      verantwortliche: 1,
      laender: ["HH"],
      staaten: ["DK"],
      standorte: [{ id: "s1", name: "Hamburg", land: "HH", aktiv: true }],
    },
  ],
};

const mutate = {
  anlegen: vi.fn(),
  aendern: vi.fn(),
  laender: vi.fn(),
  staaten: vi.fn(),
  standort: vi.fn(),
  loeschen: vi.fn(),
};

function mock() {
  vi.mocked(hooks.useVerwaltung).mockReturnValue({
    data: daten,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof hooks.useVerwaltung>);
  const m = (fn: ReturnType<typeof vi.fn>) => ({ mutate: fn, isPending: false }) as never;
  vi.mocked(hooks.useRegionAnlegen).mockReturnValue(m(mutate.anlegen));
  vi.mocked(hooks.useRegionAendern).mockReturnValue(m(mutate.aendern));
  vi.mocked(hooks.useRegionLoeschen).mockReturnValue(m(mutate.loeschen));
  vi.mocked(hooks.useLaenderSetzen).mockReturnValue(m(mutate.laender));
  vi.mocked(hooks.useStaatenSetzen).mockReturnValue(m(mutate.staaten));
  vi.mocked(hooks.useStandortAnlegen).mockReturnValue(m(mutate.standort));
  vi.mocked(hooks.useStandortLoeschen).mockReturnValue(m(vi.fn()));
}

describe("AdminRegionenPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock();
  });

  it("nennt Bundesländer ohne Region", () => {
    renderWithProviders(<AdminRegionenPage />);
    expect(screen.getByText("admin_ohne_region")).toBeInTheDocument();
  });

  it("legt eine Region an", () => {
    renderWithProviders(<AdminRegionenPage />);
    fireEvent.change(screen.getByLabelText("admin_region_neu"), { target: { value: " Süd " } });
    fireEvent.click(screen.getByText("admin_anlegen"));
    expect(mutate.anlegen).toHaveBeenCalledWith({ name: "Süd" }, expect.any(Object));
  });

  it("ordnet ein Bundesland zu und ab", () => {
    renderWithProviders(<AdminRegionenPage />);
    fireEvent.click(screen.getByLabelText("Hessen"));
    expect(mutate.laender).toHaveBeenCalledWith(
      { id: "r1", laender: ["HH", "HE"] },
      expect.any(Object),
    );
    fireEvent.click(screen.getByLabelText("Hamburg"));
    expect(mutate.laender).toHaveBeenLastCalledWith({ id: "r1", laender: [] }, expect.any(Object));
  });

  it("ordnet ein Land außerhalb Deutschlands zu und ab", () => {
    renderWithProviders(<AdminRegionenPage />);
    fireEvent.click(screen.getByLabelText(/France|Frankreich/));
    expect(mutate.staaten).toHaveBeenCalledWith(
      { id: "r1", staaten: ["DK", "FR"] },
      expect.any(Object),
    );
    fireEvent.click(screen.getByLabelText(/Danemark|Dänemark|Denmark/));
    expect(mutate.staaten).toHaveBeenLastCalledWith({ id: "r1", staaten: [] }, expect.any(Object));
  });

  it("legt einen Standort an", () => {
    renderWithProviders(<AdminRegionenPage />);
    fireEvent.change(screen.getByLabelText("admin_standort_neu"), { target: { value: "Bremen" } });
    fireEvent.click(screen.getByText("admin_hinzufuegen"));
    expect(mutate.standort).toHaveBeenCalledWith(
      { regionId: "r1", name: "Bremen" },
      expect.any(Object),
    );
  });
});
