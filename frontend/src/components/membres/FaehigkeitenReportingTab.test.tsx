import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../../api/faehigkeiten";
import * as hooks from "../../hooks/useFaehigkeiten";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { FaehigkeitenBericht } from "../../types/faehigkeiten";
import FaehigkeitenReportingTab from "./FaehigkeitenReportingTab";

vi.mock("../../hooks/useFaehigkeiten", () => ({
  useFaehigkeitenBericht: vi.fn(),
  useFaehigkeitenKatalog: vi.fn(),
  useLoescheFaehigkeit: vi.fn(),
}));
vi.mock("../../api/faehigkeiten", () => ({ exportFaehigkeitenBericht: vi.fn() }));
vi.mock("../../utils/telechargement", () => ({ declencherTelechargement: vi.fn() }));

const bericht: FaehigkeitenBericht = {
  summen: { faehigkeiten: 1, mitglieder: 1, zuordnungen: 1 },
  ergebnisse: [
    {
      id: "f1",
      bezeichnung: "Webdesign",
      kategorie: "it_web",
      ist_standard: true,
      anzahl: 1,
      mitglieder: [
        {
          id: "m1",
          nom_complet: "Anna Aktiv",
          numero_membre: "CA-1",
          email: "anna@example.de",
          ville: "Berlin",
          statut: "actif",
          kommentar: "Figma",
        },
      ],
    },
  ],
};

describe("FaehigkeitenReportingTab", () => {
  beforeEach(() => {
    vi.mocked(hooks.useFaehigkeitenBericht).mockReturnValue({
      data: bericht,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof hooks.useFaehigkeitenBericht>);
    vi.mocked(hooks.useFaehigkeitenKatalog).mockReturnValue({
      data: [],
    } as unknown as ReturnType<typeof hooks.useFaehigkeitenKatalog>);
    vi.mocked(hooks.useLoescheFaehigkeit).mockReturnValue({
      mutate: vi.fn(),
    } as unknown as ReturnType<typeof hooks.useLoescheFaehigkeit>);
  });

  it("zeigt Fähigkeiten mit Mitgliedern, Kontakt und Anmerkung", () => {
    renderWithProviders(<FaehigkeitenReportingTab />);
    expect(screen.getByText("Webdesign")).toBeInTheDocument();
    expect(screen.getByText("Anna Aktiv")).toBeInTheDocument();
    expect(screen.getByText("anna@example.de")).toBeInTheDocument();
    expect(screen.getByText("Figma")).toBeInTheDocument();
  });

  it("reicht Filter an die Abfrage weiter", () => {
    renderWithProviders(<FaehigkeitenReportingTab />);
    fireEvent.change(screen.getByPlaceholderText("faehigkeiten.reporting.suche_platzhalter"), {
      target: { value: "web" },
    });
    const aufrufe = vi.mocked(hooks.useFaehigkeitenBericht).mock.calls;
    expect(aufrufe[aufrufe.length - 1][0].q).toBe("web");
  });

  it("exportiert die gefilterte Auswahl", async () => {
    vi.mocked(api.exportFaehigkeitenBericht).mockResolvedValue({
      blob: new Blob(["x"]),
      nomFichier: "faehigkeiten.xlsx",
    });
    renderWithProviders(<FaehigkeitenReportingTab />);
    fireEvent.click(screen.getByRole("button", { name: "faehigkeiten.reporting.export" }));
    await waitFor(() => expect(api.exportFaehigkeitenBericht).toHaveBeenCalled());
  });
});
