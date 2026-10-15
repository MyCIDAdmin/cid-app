import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useRegionen";
import { useAuthStore } from "../../store/authStore";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { Region } from "../../types/regionen";
import RegionenPage from "./RegionenPage";

vi.mock("../../components/regionen/FreigabeListe", () => ({
  default: () => <div data-testid="freigabe" />,
}));
vi.mock("../../components/regionen/FanKarte", () => ({
  default: () => <div data-testid="fankarte" />,
}));
vi.mock("../../hooks/useRegionen", () => ({ useRegionen: vi.fn() }));

function region(o: Partial<Region> = {}): Region {
  return {
    id: "r1",
    slug: "nord",
    name: "Nord",
    farbe: "#0e7490",
    banner_url: null,
    beschreibung: { de: "Moin aus dem Norden", fr: "" },
    mitglieder: 12,
    verantwortliche: [],
    meine_region: false,
    naechste_veranstaltung: null,
    ...o,
  };
}

function mock(data: unknown, extra: Record<string, unknown> = {}) {
  vi.mocked(hooks.useRegionen).mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    ...extra,
  } as unknown as ReturnType<typeof hooks.useRegionen>);
}

describe("RegionenPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("zeigt Laden und Fehler", () => {
    mock(undefined, { isLoading: true });
    const { unmount } = renderWithProviders(<RegionenPage />);
    expect(screen.getByText("laden")).toBeInTheDocument();
    unmount();
    mock(undefined, { isError: true });
    renderWithProviders(<RegionenPage />);
    expect(screen.getByText("fehler_laden")).toBeInTheDocument();
  });

  it("listet Regionen mit Link und Markierung der eigenen Region", () => {
    mock({
      ergebnisse: [region(), region({ id: "r2", slug: "nrw", name: "NRW", meine_region: true })],
      ohne_region: false,
    });
    renderWithProviders(<RegionenPage />);
    expect(screen.getAllByRole("link")[0]).toHaveAttribute("href", "/regionen/wettbewerb");
    expect(screen.getAllByRole("link")[1]).toHaveAttribute("href", "/regionen/nord");
    expect(screen.getByText("meine_region")).toBeInTheDocument();
    expect(screen.queryByText("ohne_region_hinweis")).not.toBeInTheDocument();
  });

  it("weist auf fehlende Region hin und zeigt leeren Zustand", () => {
    mock({ ergebnisse: [], ohne_region: true });
    renderWithProviders(<RegionenPage />);
    expect(screen.getByText("ohne_region_hinweis")).toBeInTheDocument();
    expect(screen.getByText("keine_regionen")).toBeInTheDocument();
  });

  it("zeigt das nächste Treffen und die Freigabeliste nur für das Büro", () => {
    mock({
      ergebnisse: [
        region({
          naechste_veranstaltung: {
            id: "v1",
            titel: "Derby-Abend",
            datum: "2026-11-07",
            uhrzeit: null,
            ort: "Köln",
          },
        }),
      ],
      ohne_region: false,
      darf_freigeben: true,
    });
    const { unmount } = renderWithProviders(<RegionenPage />);
    expect(screen.getByText("naechstes_treffen")).toBeInTheDocument();
    expect(screen.getByTestId("freigabe")).toBeInTheDocument();
    unmount();
    mock({ ergebnisse: [region()], ohne_region: false, darf_freigeben: false });
    renderWithProviders(<RegionenPage />);
    expect(screen.queryByTestId("freigabe")).not.toBeInTheDocument();
    expect(screen.queryByText("naechstes_treffen")).not.toBeInTheDocument();
  });

  it("zeigt den Link zum Bericht nur mit Berichtsrecht", () => {
    mock({ ergebnisse: [region()], ohne_region: false, darf_berichte: true });
    const { unmount } = renderWithProviders(<RegionenPage />);
    expect(
      screen.getAllByRole("link").some((a) => a.getAttribute("href") === "/regionen/bericht"),
    ).toBe(true);
    unmount();
    mock({ ergebnisse: [region()], ohne_region: false, darf_berichte: false });
    renderWithProviders(<RegionenPage />);
    expect(
      screen.getAllByRole("link").some((a) => a.getAttribute("href") === "/regionen/bericht"),
    ).toBe(false);
  });

  it("zeigt die Fan-Karte nur für Fan-Konten", () => {
    mock({ ergebnisse: [region()], ohne_region: false, darf_freigeben: false });
    useAuthStore.setState({
      user: { id: "u", email: "a@b.de", role: "membre", langue_preferee: "de", ist_fan: true },
    });
    const { unmount } = renderWithProviders(<RegionenPage />);
    expect(screen.getByTestId("fankarte")).toBeInTheDocument();
    unmount();
    useAuthStore.setState({
      user: { id: "u", email: "a@b.de", role: "membre", langue_preferee: "de", ist_fan: false },
    });
    renderWithProviders(<RegionenPage />);
    expect(screen.queryByTestId("fankarte")).not.toBeInTheDocument();
    useAuthStore.setState({ user: null });
  });
});
