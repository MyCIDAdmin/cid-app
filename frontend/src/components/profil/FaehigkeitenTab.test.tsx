import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useFaehigkeiten";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { Faehigkeit } from "../../types/faehigkeiten";
import FaehigkeitenTab from "./FaehigkeitenTab";

vi.mock("../../hooks/useFaehigkeiten", () => ({
  useFaehigkeitenKatalog: vi.fn(),
  useMeineFaehigkeiten: vi.fn(),
  useSpeichereMeineFaehigkeiten: vi.fn(),
  useErstelleFaehigkeit: vi.fn(),
}));

const katalog: Faehigkeit[] = [
  { id: "f1", bezeichnung: "Webdesign", kategorie: "it_web", ist_standard: true },
  { id: "f2", bezeichnung: "Logistik", kategorie: "organisation", ist_standard: true },
];
const speichern = vi.fn();
const erstellen = vi.fn();

function mocks(meine: { faehigkeit: string; kommentar: string }[] = []) {
  vi.mocked(hooks.useFaehigkeitenKatalog).mockReturnValue({
    data: katalog,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof hooks.useFaehigkeitenKatalog>);
  vi.mocked(hooks.useMeineFaehigkeiten).mockReturnValue({
    data: meine,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof hooks.useMeineFaehigkeiten>);
  vi.mocked(hooks.useSpeichereMeineFaehigkeiten).mockReturnValue({
    mutate: speichern,
    isPending: false,
  } as unknown as ReturnType<typeof hooks.useSpeichereMeineFaehigkeiten>);
  vi.mocked(hooks.useErstelleFaehigkeit).mockReturnValue({
    mutate: erstellen,
    isPending: false,
  } as unknown as ReturnType<typeof hooks.useErstelleFaehigkeit>);
}

describe("FaehigkeitenTab", () => {
  beforeEach(() => {
    speichern.mockReset();
    erstellen.mockReset();
  });

  it("zeigt den Katalog nach Kategorien und markiert die eigene Auswahl", async () => {
    mocks([{ faehigkeit: "f1", kommentar: "Figma" }]);
    renderWithProviders(<FaehigkeitenTab />);
    expect(screen.getAllByText("faehigkeiten.kategorie.it_web").length).toBeGreaterThan(0);
    expect(screen.getAllByText("faehigkeiten.kategorie.organisation").length).toBeGreaterThan(0);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Webdesign/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    expect(screen.getByRole("button", { name: "Logistik" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByDisplayValue("Figma")).toBeInTheDocument();
  });

  it("speichert Auswahl und Anmerkung", async () => {
    mocks();
    renderWithProviders(<FaehigkeitenTab />);
    fireEvent.click(screen.getByRole("button", { name: "Logistik" }));
    fireEvent.change(screen.getByLabelText(/faehigkeiten.anmerkung_fuer/), {
      target: { value: "Lager" },
    });
    fireEvent.click(screen.getByRole("button", { name: "faehigkeiten.speichern" }));
    expect(speichern.mock.calls[0][0]).toEqual([{ faehigkeit: "f2", kommentar: "Lager" }]);
  });

  it("legt eine eigene Fähigkeit an", () => {
    mocks();
    renderWithProviders(<FaehigkeitenTab />);
    fireEvent.change(screen.getByLabelText("faehigkeiten.eigene_label"), {
      target: { value: "Drohnenfotografie" },
    });
    fireEvent.click(screen.getByRole("button", { name: "faehigkeiten.hinzufuegen" }));
    expect(erstellen.mock.calls[0][0]).toEqual({
      bezeichnung: "Drohnenfotografie",
      kategorie: "weitere",
    });
  });
});
