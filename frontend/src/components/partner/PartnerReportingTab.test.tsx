import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as partnerApi from "../../api/partner";
import * as usePartnerHooks from "../../hooks/usePartner";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { PartnerReporting, PartnerReportingZeile } from "../../types/partner";
import PartnerReportingTab from "./PartnerReportingTab";

vi.mock("../../hooks/usePartner", async () => {
  const actual = await vi.importActual<typeof usePartnerHooks>("../../hooks/usePartner");
  return { ...actual, usePartnerReporting: vi.fn(), usePartnerKategorien: vi.fn() };
});
vi.mock("../../api/partner", async () => {
  const actual = await vi.importActual<typeof partnerApi>("../../api/partner");
  return { ...actual, exportReporting: vi.fn() };
});
vi.mock("../../utils/telechargement", () => ({ declencherTelechargement: vi.fn() }));

function zeile(extra: Partial<PartnerReportingZeile> = {}): PartnerReportingZeile {
  return {
    id: "p1",
    nom: "Sponsor AG",
    typ: "partner",
    statut: "aktiv",
    bevorzugt: false,
    auf_startseite: true,
    kategorien_namen: ["Medien"],
    website: "https://sponsor.example",
    email: "kontakt@sponsor.example",
    telefon: "0221 1",
    ville: "Köln",
    pays: "Deutschland",
    hauptkontakt_name: "Anna Muster",
    bewertung_schnitt: 4.5,
    bewertung_anzahl: 2,
    ausgaben_summe: "0.00",
    ausgaben_anzahl: 0,
    einnahmen_summe: "500.00",
    einnahmen_anzahl: 1,
    umsatz: "500.00",
    saldo: "500.00",
    angebote_anzahl: 0,
    zuschlaege_anzahl: 0,
    zuschlaege_summe: "0.00",
    verknuepfungen: [
      { id: "v1", ziel_typ: "projet", ziel_id: "x", ziel_label: "Festschrift", rolle: "sponsor" },
      { id: "v2", ziel_typ: "evenement", ziel_id: "y", ziel_label: "Sommerfest", rolle: "sponsor" },
    ],
    ...extra,
  };
}

const daten: PartnerReporting = {
  summen: {
    partner: 2,
    einnahmen: "500.00",
    ausgaben: "200.00",
    umsatz: "700.00",
    saldo: "300.00",
    verknuepfungen: 2,
  },
  ergebnisse: [
    zeile(),
    zeile({
      id: "p2",
      nom: "Druck GmbH",
      typ: "lieferant",
      auf_startseite: false,
      einnahmen_summe: "0.00",
      ausgaben_summe: "200.00",
      umsatz: "200.00",
      saldo: "-200.00",
      verknuepfungen: [],
    }),
  ],
};

describe("PartnerReportingTab", () => {
  beforeEach(() => {
    vi.mocked(usePartnerHooks.usePartnerReporting).mockReturnValue({
      data: daten,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof usePartnerHooks.usePartnerReporting>);
    vi.mocked(usePartnerHooks.usePartnerKategorien).mockReturnValue({
      data: [{ id: "k1", nom: "Medien", nom_fr: "", actif: true }],
    } as unknown as ReturnType<typeof usePartnerHooks.usePartnerKategorien>);
    vi.mocked(partnerApi.exportReporting).mockReset();
  });

  it("zeigt Kennzahlen und Zeilen mit Umsatz", () => {
    renderWithProviders(<PartnerReportingTab />);
    expect(screen.getByText("reporting.kpi_umsatz")).toBeInTheDocument();
    expect(screen.getByText("Sponsor AG")).toBeInTheDocument();
    expect(screen.getByText("Druck GmbH")).toBeInTheDocument();
    expect(screen.getAllByText(/700,00/).length).toBeGreaterThan(0);
  });

  it("klappt Details mit verknüpften Elementen auf", () => {
    renderWithProviders(<PartnerReportingTab />);
    expect(screen.queryByText("Festschrift")).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "reporting.details_oeffnen" })[0]);
    expect(screen.getByText("Festschrift")).toBeInTheDocument();
    expect(screen.getByText("Sommerfest")).toBeInTheDocument();
    expect(screen.getByText("Anna Muster")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "reporting.zum_partner" })).toHaveAttribute(
      "href",
      "/admin/partner/p1",
    );
  });

  it("übergibt Filter an die Abfrage", () => {
    renderWithProviders(<PartnerReportingTab />);
    fireEvent.change(screen.getByLabelText("reporting.filter_rolle"), {
      target: { value: "sponsor" },
    });
    fireEvent.change(screen.getByLabelText("reporting.filter_von"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Medien" }));
    const letzter = vi.mocked(usePartnerHooks.usePartnerReporting).mock.lastCall?.[0];
    expect(letzter).toMatchObject({ rolle: "sponsor", von: "2026-01-01", kategorie: ["k1"] });
  });

  it("exportiert mit den aktuellen Filtern", async () => {
    vi.mocked(partnerApi.exportReporting).mockResolvedValue({
      blob: new Blob(["x"]),
      nomFichier: "reporting.xlsx",
    });
    renderWithProviders(<PartnerReportingTab />);
    fireEvent.change(screen.getByLabelText("feld_typ"), { target: { value: "lieferant" } });
    fireEvent.click(screen.getByRole("button", { name: "reporting.export" }));
    await waitFor(() => expect(partnerApi.exportReporting).toHaveBeenCalledTimes(1));
    expect(vi.mocked(partnerApi.exportReporting).mock.calls[0][0]).toMatchObject({
      typ: "lieferant",
    });
  });

  it("zeigt einen Hinweis ohne Treffer", () => {
    vi.mocked(usePartnerHooks.usePartnerReporting).mockReturnValue({
      data: { ...daten, ergebnisse: [] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof usePartnerHooks.usePartnerReporting>);
    renderWithProviders(<PartnerReportingTab />);
    expect(screen.getByText("keine_treffer")).toBeInTheDocument();
  });
});
