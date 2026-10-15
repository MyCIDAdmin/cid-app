import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useRegionen";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { FansListe } from "../../types/regionen";
import FansBereich from "./FansBereich";

vi.mock("../../hooks/useRegionen", () => ({ useFans: vi.fn(), useFanDetail: vi.fn() }));

const liste: FansListe = {
  gesamt: 2,
  mitglieder: 1,
  fans: 1,
  ergebnisse: [
    {
      user: "u1",
      name: "Amel B.",
      art: "mitglied",
      anmeldungen: 3,
      teilnahmen: 2,
      reaktionen: 1,
      letzte_aktivitaet: "2026-09-20T10:00:00Z",
    },
    {
      user: "u2",
      name: "",
      art: "fan",
      anmeldungen: 1,
      teilnahmen: 0,
      reaktionen: 0,
      letzte_aktivitaet: "2026-09-10T10:00:00Z",
    },
  ],
};

function mockFans(data: FansListe | undefined, extra: Record<string, unknown> = {}) {
  vi.mocked(hooks.useFans).mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    ...extra,
  } as unknown as ReturnType<typeof hooks.useFans>);
  vi.mocked(hooks.useFanDetail).mockReturnValue({
    data: {
      name: "Amel B.",
      art: "mitglied",
      reaktionen: 1,
      veranstaltungen: [
        {
          id: "v1",
          titel: "Derby-Abend",
          datum: "2026-09-12",
          angemeldet_am: "2026-09-01T10:00:00Z",
          anwesend: true,
          abgeschlossen: true,
        },
      ],
    },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof hooks.useFanDetail>);
}

describe("FansBereich", () => {
  beforeEach(() => vi.clearAllMocks());

  it("zeigt Zusammenfassung und Zeilen ohne Kontaktdaten", () => {
    mockFans(liste);
    renderWithProviders(<FansBereich slug="nord" />);
    expect(screen.getByText("Amel B.")).toBeInTheDocument();
    expect(screen.getByText("fans.ohne_name")).toBeInTheDocument();
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
  });

  it("klappt die Aktivitäten einer Person auf", () => {
    mockFans(liste);
    renderWithProviders(<FansBereich slug="nord" />);
    fireEvent.click(screen.getByRole("button", { name: "Amel B." }));
    expect(screen.getByText("Derby-Abend")).toBeInTheDocument();
    expect(vi.mocked(hooks.useFanDetail)).toHaveBeenCalledWith("nord", "u1");
  });

  it("reicht Suche und Art an die Abfrage weiter", () => {
    mockFans(liste);
    renderWithProviders(<FansBereich slug="nord" />);
    fireEvent.change(screen.getByLabelText("fans.suche"), { target: { value: " ame " } });
    fireEvent.change(screen.getByLabelText("fans.art"), { target: { value: "fan" } });
    expect(vi.mocked(hooks.useFans)).toHaveBeenLastCalledWith(
      expect.objectContaining({ slug: "nord", q: "ame", art: "fan" }),
    );
  });

  it("zeigt leeren Zustand und Fehler", () => {
    mockFans({ gesamt: 0, mitglieder: 0, fans: 0, ergebnisse: [] });
    const { unmount } = renderWithProviders(<FansBereich slug="nord" />);
    expect(screen.getByText("fans.leer")).toBeInTheDocument();
    unmount();
    mockFans(undefined, { isError: true });
    renderWithProviders(<FansBereich slug="nord" />);
    expect(screen.getByText("fans.fehler")).toBeInTheDocument();
  });
});
