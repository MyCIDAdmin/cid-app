import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../../api/regionen";
import * as hooks from "../../hooks/useRegionen";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { Bericht, Kennzahlen } from "../../types/regionen";
import BerichtPage from "./BerichtPage";

vi.mock("../../hooks/useRegionen", () => ({ useBericht: vi.fn() }));
vi.mock("../../api/regionen", () => ({ ladeBerichtCsv: vi.fn() }));

function k(o: Partial<Kennzahlen> = {}): Kennzahlen {
  return {
    treffen: 2,
    geplant: 1,
    abgesagt: 0,
    anmeldungen: 8,
    anwesende: 6,
    anwesenheitsquote: 75,
    beitraege: 3,
    reaktionen: 5,
    fans_gesamt: 7,
    fans_mitglieder: 4,
    fans_ohne_mitgliedschaft: 3,
    fans_neu: 2,
    fans_aktiv: 6,
    fan_zu_mitglied: 1,
    punkte: 110,
    ...o,
  };
}

const bericht: Bericht = {
  von: "2026-01-01",
  bis: "2026-10-15",
  regionen: [
    { slug: "nord", name: "Nord", ...k() },
    { slug: "nrw", name: "NRW", ...k({ anwesenheitsquote: null }) },
  ],
  gesamt: k({ treffen: 4 }),
};

function mock(data: Bericht | undefined, extra: Record<string, unknown> = {}) {
  vi.mocked(hooks.useBericht).mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    ...extra,
  } as unknown as ReturnType<typeof hooks.useBericht>);
}

describe("BerichtPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("zeigt Regionen als Spalten, Kennzahlen als Zeilen und Gesamt", () => {
    mock(bericht);
    renderWithProviders(<BerichtPage />);
    expect(screen.getByRole("columnheader", { name: "Nord" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "NRW" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "bericht.gesamt" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "bericht.zeile.treffen" })).toBeInTheDocument();
    expect(screen.getAllByText("75 %").length).toBe(2);
    expect(screen.getByText("–")).toBeInTheDocument();
  });

  it("meldet einen ungültigen Zeitraum", () => {
    mock(undefined);
    renderWithProviders(<BerichtPage />);
    fireEvent.change(screen.getByLabelText("bericht.bis"), { target: { value: "2020-01-01" } });
    expect(screen.getByText("bericht.zeitraum_falsch")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "bericht.export" })).toBeDisabled();
  });

  it("lädt die CSV-Datei und meldet Fehler beim Export", async () => {
    mock(bericht);
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    vi.mocked(api.ladeBerichtCsv).mockResolvedValueOnce(new Blob(["a"]));
    renderWithProviders(<BerichtPage />);
    fireEvent.click(screen.getByRole("button", { name: "bericht.export" }));
    await waitFor(() => expect(api.ladeBerichtCsv).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalled());
    vi.mocked(api.ladeBerichtCsv).mockRejectedValueOnce(new Error("x"));
    fireEvent.click(screen.getByRole("button", { name: "bericht.export" }));
    expect(await screen.findByText("bericht.export_fehler")).toBeInTheDocument();
  });

  it("zeigt Fehler beim Laden", () => {
    mock(undefined, { isError: true });
    renderWithProviders(<BerichtPage />);
    expect(screen.getByText("bericht.fehler_laden")).toBeInTheDocument();
  });
});
