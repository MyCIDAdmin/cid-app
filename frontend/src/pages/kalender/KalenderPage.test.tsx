import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useKalender";
import { renderWithProviders } from "../../test/renderWithProviders";
import { eintrag } from "../../test/kalenderFixture";
import type { KalenderZugang } from "../../types/kalender";
import KalenderPage from "./KalenderPage";

vi.mock("../../hooks/useKalender", async () => {
  const actual = await vi.importActual<typeof hooks>("../../hooks/useKalender");
  return {
    ...actual,
    useKalenderZugang: vi.fn(),
    useKalenderEintraege: vi.fn(),
    useTermin: vi.fn(() => ({ data: undefined })),
  };
});
vi.mock("../../hooks/useProjets", () => ({ useProjets: () => ({ data: { results: [] } }) }));

function zugang(extra: Partial<KalenderZugang> = {}) {
  vi.mocked(hooks.useKalenderZugang).mockReturnValue({
    data: {
      verein: true,
      buero: false,
      schreiben: false,
      vorschlagen: false,
      verwaltung: false,
      ...extra,
    },
  } as unknown as ReturnType<typeof hooks.useKalenderZugang>);
}

beforeEach(() => {
  vi.mocked(hooks.useKalenderEintraege).mockReturnValue({
    data: [eintrag()],
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof hooks.useKalenderEintraege>);
});

describe("KalenderPage", () => {
  it("zeigt Mitgliedern nur Vereinskalender und Meine Termine", () => {
    zugang();
    renderWithProviders(<KalenderPage />);
    expect(screen.getByRole("tab", { name: "tab.verein" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "tab.meine" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "tab.buero" })).not.toBeInTheDocument();
    expect(screen.queryByText("neuer_termin")).not.toBeInTheDocument();
    expect(screen.queryByText("termin_vorschlagen")).not.toBeInTheDocument();
  });

  it("zeigt den Büro-Reiter und „Neuer Termin“ mit Schreibrecht", () => {
    zugang({ buero: true, schreiben: true, verwaltung: true });
    renderWithProviders(<KalenderPage />);
    expect(screen.getByRole("tab", { name: "tab.buero" })).toBeInTheDocument();
    expect(screen.getByText("neuer_termin")).toBeInTheDocument();
  });

  it("bietet nur „Vorschlagen“ ohne Schreibrecht", () => {
    zugang({ vorschlagen: true });
    renderWithProviders(<KalenderPage />);
    fireEvent.click(screen.getByText("termin_vorschlagen"));
    expect(screen.getByText("form.vorschlagen")).toBeInTheDocument();
    expect(screen.queryByText("form.einladen")).not.toBeInTheDocument();
  });

  it("öffnet den Termin im Dialog und wechselt zur Liste", () => {
    zugang();
    renderWithProviders(<KalenderPage />);
    fireEvent.change(screen.getByLabelText("modus.label"), { target: { value: "liste" } });
    expect(screen.getByTestId("kalender-liste")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Vorstandssitzung"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("filtert nach Kategorie", () => {
    zugang();
    renderWithProviders(<KalenderPage />);
    fireEvent.change(screen.getByLabelText("modus.label"), { target: { value: "liste" } });
    fireEvent.change(screen.getByLabelText("filter.kategorie"), { target: { value: "frist" } });
    expect(screen.queryByText("Vorstandssitzung")).not.toBeInTheDocument();
  });
});
