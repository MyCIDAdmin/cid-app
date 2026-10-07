import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as reportingApi from "../../api/membreReporting";
import * as reportingHooks from "../../hooks/useMembreReporting";
import * as useMembresHooks from "../../hooks/useMembres";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { AktivitaetenReporting, MitgliederReporting } from "../../types/membreReporting";
import MembreReportingTab from "./MembreReportingTab";

vi.mock("../../hooks/useMembreReporting", () => ({
  useMitgliederReporting: vi.fn(),
  useAktivitaetenReporting: vi.fn(),
}));
vi.mock("../../hooks/useMembres", () => ({ useMembresList: vi.fn() }));
vi.mock("../../api/membreReporting", () => ({ exportMembreReporting: vi.fn() }));
vi.mock("../../utils/telechargement", () => ({ declencherTelechargement: vi.fn() }));

const mitglieder: MitgliederReporting = {
  count: 1,
  page: 1,
  page_size: 25,
  summen: { mitglieder: 1, aktivitaeten: 3, betrag: "150.00" },
  ergebnisse: [
    {
      id: "m1",
      numero_membre: "CA-2026-001",
      prenom: "Anna",
      nom: "Aktiv",
      email: "anna@example.de",
      pays: "DE",
      ville: "Berlin",
      statut: "actif",
      date_adhesion: "2024-03-01",
      historie: [
        { annee: 2025, statut: "actif", raison: "paiement_confirme", date_effet: "2025-02-01" },
        { annee: 2024, statut: "inactif", raison: "manuel", date_effet: "2024-02-01" },
      ],
      aktivitaeten: { mitgliedschaft: 1, bestellung: 2 },
      aktivitaeten_gesamt: 3,
      betrag_gesamt: "150.00",
    },
  ],
};

const aktivitaeten: AktivitaetenReporting = {
  count: 2,
  page: 1,
  page_size: 50,
  typen: ["mitgliedschaft", "bestellung"],
  summen: {
    mitgliedschaft: { anzahl: 1, betrag: "50.00" },
    bestellung: { anzahl: 1, betrag: "30.00" },
  },
  ergebnisse: [
    {
      typ: "bestellung",
      id: "c1",
      datum: "2026-05-02T10:00:00+02:00",
      membre_id: "m1",
      membre_name: "Anna Aktiv",
      numero_membre: "CA-2026-001",
      titel: "CMD-123",
      betrag: "30.00",
      statut: "livree",
    },
    {
      typ: "projektmitarbeit",
      id: "t1",
      datum: "2026-04-02T10:00:00+02:00",
      membre_id: "m1",
      membre_name: "Anna Aktiv",
      numero_membre: "CA-2026-001",
      titel: "Festschrift (mitarbeit)",
      betrag: null,
      statut: "",
    },
  ],
};

function ergebnis<T>(data: T) {
  return { data, isLoading: false, isError: false };
}

describe("MembreReportingTab", () => {
  beforeEach(() => {
    vi.mocked(useMembresHooks.useMembresList).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as unknown as ReturnType<typeof useMembresHooks.useMembresList>);
    vi.mocked(reportingHooks.useMitgliederReporting).mockReturnValue(
      ergebnis(mitglieder) as unknown as ReturnType<typeof reportingHooks.useMitgliederReporting>,
    );
    vi.mocked(reportingHooks.useAktivitaetenReporting).mockReturnValue(
      ergebnis(aktivitaeten) as unknown as ReturnType<
        typeof reportingHooks.useAktivitaetenReporting
      >,
    );
    vi.mocked(reportingApi.exportMembreReporting).mockReset();
  });

  it("zeigt Mitglieder mit Statushistorie und Aktivitätszahlen", () => {
    renderWithProviders(<MembreReportingTab />);
    expect(screen.getByRole("link", { name: "Anna Aktiv" })).toHaveAttribute("href", "/membres/m1");
    expect(screen.getByText(/2025 · statut.actif/)).toBeInTheDocument();
    expect(screen.getByText(/2024 · statut.inactif/)).toBeInTheDocument();
    expect(
      screen.getByText("reporting.typ.mitgliedschaft 1 · reporting.typ.bestellung 2"),
    ).toBeInTheDocument();
    expect(screen.getByText("reporting.kpi_betrag")).toBeInTheDocument();
  });

  it("wechselt zur Aktivitätenliste", () => {
    renderWithProviders(<MembreReportingTab />);
    fireEvent.click(screen.getByRole("button", { name: "reporting.ansicht_aktivitaeten" }));
    expect(screen.getByText("CMD-123")).toBeInTheDocument();
    expect(screen.getByText("Festschrift (mitarbeit)")).toBeInTheDocument();
    expect(screen.getByText("—", { selector: "td" })).toBeInTheDocument();
  });

  it("springt aus der Mitgliederliste zu den Aktivitäten dieses Mitglieds", () => {
    renderWithProviders(<MembreReportingTab />);
    fireEvent.click(screen.getByRole("button", { name: "reporting.aktivitaeten_zeigen" }));
    const letzter = vi.mocked(reportingHooks.useAktivitaetenReporting).mock.lastCall;
    expect(letzter?.[0]).toMatchObject({ membre: "m1" });
    expect(screen.getByText("Anna Aktiv (CA-2026-001)")).toBeInTheDocument();
  });

  it("übergibt Filter und setzt die Seite zurück", () => {
    renderWithProviders(<MembreReportingTab />);
    fireEvent.change(screen.getByLabelText("liste.filtre_statut"), {
      target: { value: "inactif" },
    });
    fireEvent.change(screen.getByLabelText("reporting.filter_historie_jahr"), {
      target: { value: "2025x" },
    });
    fireEvent.click(screen.getByRole("button", { name: "reporting.typ.bestellung" }));
    const letzter = vi.mocked(reportingHooks.useMitgliederReporting).mock.lastCall;
    expect(letzter?.[0]).toMatchObject({
      statut: "inactif",
      historie_jahr: "2025",
      typ: ["bestellung"],
    });
    expect(letzter?.[1]).toBe(1);
  });

  it("exportiert die aktuelle Ansicht", async () => {
    vi.mocked(reportingApi.exportMembreReporting).mockResolvedValue({
      blob: new Blob(["x"]),
      nomFichier: "r.xlsx",
    });
    renderWithProviders(<MembreReportingTab />);
    fireEvent.click(screen.getByRole("button", { name: "reporting.ansicht_aktivitaeten" }));
    fireEvent.click(screen.getByRole("button", { name: "reporting.export" }));
    await waitFor(() => expect(reportingApi.exportMembreReporting).toHaveBeenCalledTimes(1));
    expect(vi.mocked(reportingApi.exportMembreReporting).mock.calls[0][0]).toBe("aktivitaeten");
  });

  it("blättert bei mehr Einträgen als eine Seite", () => {
    vi.mocked(reportingHooks.useMitgliederReporting).mockReturnValue(
      ergebnis({ ...mitglieder, count: 60 }) as unknown as ReturnType<
        typeof reportingHooks.useMitgliederReporting
      >,
    );
    renderWithProviders(<MembreReportingTab />);
    fireEvent.click(screen.getByRole("button", { name: "reporting.weiter" }));
    expect(vi.mocked(reportingHooks.useMitgliederReporting).mock.lastCall?.[1]).toBe(2);
  });

  it("filtert über die Mitgliedersuche auf ein einzelnes Mitglied", () => {
    vi.mocked(useMembresHooks.useMembresList).mockReturnValue({
      data: {
        results: [
          { id: "m9", prenom: "Rolf", nom: "Ruhig", numero_membre: "CA-2026-002", email: "" },
        ],
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useMembresHooks.useMembresList>);
    renderWithProviders(<MembreReportingTab />);
    fireEvent.change(screen.getByPlaceholderText("reporting.filter_mitglied_placeholder"), {
      target: { value: "Rolf" },
    });
    fireEvent.click(screen.getByText(/Rolf Ruhig/));
    expect(vi.mocked(reportingHooks.useMitgliederReporting).mock.lastCall?.[0]).toMatchObject({
      membre: "m9",
    });
  });
});
