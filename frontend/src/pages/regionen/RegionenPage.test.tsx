import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useRegionen";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { Region } from "../../types/regionen";
import RegionenPage from "./RegionenPage";

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
    expect(screen.getAllByRole("link")[0]).toHaveAttribute("href", "/regionen/nord");
    expect(screen.getByText("meine_region")).toBeInTheDocument();
    expect(screen.queryByText("ohne_region_hinweis")).not.toBeInTheDocument();
  });

  it("weist auf fehlende Region hin und zeigt leeren Zustand", () => {
    mock({ ergebnisse: [], ohne_region: true });
    renderWithProviders(<RegionenPage />);
    expect(screen.getByText("ohne_region_hinweis")).toBeInTheDocument();
    expect(screen.getByText("keine_regionen")).toBeInTheDocument();
  });
});
