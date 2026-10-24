import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import helpDe from "../../../public/locales/de/help.json";
import { renderWithProviders } from "../../test/renderWithProviders";
import AufgabenkartenPage from "./AufgabenkartenPage";

// Die Seite liest die echten deutschen Hilfetexte : So prüft der Test auch, dass die Karten
// aus help.json ankommen. Fehlende Schlüssel liefern den Schlüssel selbst, wie im Rest der Tests.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { returnObjects?: boolean; count?: number; defaultValue?: string }) => {
      const wert = key
        .split(".")
        .reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], helpDe);
      if (key === "karten_anzahl") return `${opts?.count} Karten`;
      // Oberflächentexte ohne Punkt im Schlüssel bleiben Schlüssel (wie in den übrigen Tests).
      if (!key.includes(".")) return key;
      if (wert === undefined) return opts?.defaultValue ?? key;
      return wert;
    },
  }),
}));

describe("AufgabenkartenPage", () => {
  beforeEach(() => {
    window.print = vi.fn();
    window.scrollTo = vi.fn();
  });
  afterEach(() => {
    document.body.classList.remove("karten-druck");
  });

  it("zeigt die Karten mit Schritten, erwartetem Ergebnis, Fehlern und Übung", () => {
    renderWithProviders(<AufgabenkartenPage />, { route: "/hilfe/karten", path: "/hilfe/karten" });
    const karte = screen
      .getByRole("heading", { name: "Überweisung bestätigen (SEPA)" })
      .closest("article") as HTMLElement;
    expect(within(karte).getByText(/ZAHL-01/)).toBeInTheDocument();
    expect(within(karte).getByText(/Im Kontoauszug den Eingang suchen/)).toBeInTheDocument();
    expect(within(karte).getAllByText("karte_erwartet:").length).toBeGreaterThan(0);
    expect(within(karte).getByText("karte_fehler")).toBeInTheDocument();
    expect(within(karte).getByText("karte_uebung_hinweis")).toBeInTheDocument();
    expect(within(karte).getByText(/ÜBUNG/)).toBeInTheDocument();
  });

  it("filtert nach Suchtext", () => {
    renderWithProviders(<AufgabenkartenPage />, { route: "/hilfe/karten", path: "/hilfe/karten" });
    fireEvent.change(screen.getByLabelText("karten_suche"), { target: { value: "Kontoauszug" } });
    expect(screen.getByRole("heading", { name: "Kontoauszug importieren" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Neuen Lieferanten mit Vertrag erfassen" }),
    ).not.toBeInTheDocument();
  });

  it("filtert nach Rolle, Karten ohne Rollenangabe bleiben sichtbar", () => {
    renderWithProviders(<AufgabenkartenPage />, { route: "/hilfe/karten", path: "/hilfe/karten" });
    fireEvent.change(screen.getByLabelText("karten_rolle"), { target: { value: "einlass" } });
    // ZAHL-01 gilt nur für Finanzdirektor und App Admin.
    expect(
      screen.queryByRole("heading", { name: "Überweisung bestätigen (SEPA)" }),
    ).not.toBeInTheDocument();
    // MITG-01 gilt nur für RH, Büro und App Admin; die Einlass-Karte passt zur Rolle.
    expect(screen.queryByRole("heading", { name: "Mitglied finden" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tickets am Einlass scannen" })).toBeInTheDocument();
    // Karten ohne Rollenangabe (noch nicht ergänzt) bleiben sichtbar.
    expect(
      screen.getByRole("heading", { name: "2. Spalten und Formate der Mitglieder-Datei" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("karten_rolle"), { target: { value: "dir_financier" } });
    expect(
      screen.getByRole("heading", { name: "Überweisung bestätigen (SEPA)" }),
    ).toBeInTheDocument();
  });

  it("zeigt mit dem Parameter bereich nur diesen Bereich", () => {
    renderWithProviders(<AufgabenkartenPage />, {
      route: "/hilfe/karten?bereich=paiements",
      path: "/hilfe/karten",
    });
    expect(
      screen.getByRole("heading", { name: "Überweisung bestätigen (SEPA)" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Mitglied finden" })).not.toBeInTheDocument();
  });

  it("öffnet für eine Karte den Druckdialog und räumt danach auf", () => {
    renderWithProviders(<AufgabenkartenPage />, {
      route: "/hilfe/karten?bereich=paiements",
      path: "/hilfe/karten",
    });
    fireEvent.click(screen.getAllByText("karten_drucken")[0]);
    expect(window.print).toHaveBeenCalledTimes(1);
    expect(document.body.classList.contains("karten-druck")).toBe(true);
    const druck = document.getElementById("druckbereich") as HTMLElement;
    expect(druck.querySelectorAll("article")).toHaveLength(1);
    act(() => {
      window.dispatchEvent(new Event("afterprint"));
    });
    expect(document.body.classList.contains("karten-druck")).toBe(false);
    expect(document.getElementById("druckbereich")).toBeNull();
  });

  it("druckt alle angezeigten Karten", () => {
    renderWithProviders(<AufgabenkartenPage />, {
      route: "/hilfe/karten?bereich=paiements",
      path: "/hilfe/karten",
    });
    fireEvent.click(screen.getByText("karten_alle_drucken"));
    const druck = document.getElementById("druckbereich") as HTMLElement;
    expect(druck.querySelectorAll("article")).toHaveLength(helpDe.paiements.workflows.length);
  });

  it("zeigt bei gewählter Rolle den Einstieg und springt zur Karte", () => {
    renderWithProviders(<AufgabenkartenPage />, { route: "/hilfe/karten", path: "/hilfe/karten" });
    expect(screen.queryByRole("region", { name: "orientierung.einstieg.titre" })).toBeNull();
    fireEvent.change(screen.getByLabelText("karten_rolle"), { target: { value: "dir_financier" } });
    const einstieg = screen.getByRole("region", { name: /Du|So startest du/ });
    expect(within(einstieg).getByText(/Du kümmerst dich um das Geld/)).toBeInTheDocument();
    fireEvent.click(within(einstieg).getByRole("button", { name: "ZAHL-04" }));
    expect((screen.getByLabelText("karten_suche") as HTMLInputElement).value).toBe("ZAHL-04");
    expect(screen.getByRole("heading", { name: "Kontoauszug importieren" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Überweisung bestätigen (SEPA)" }),
    ).not.toBeInTheDocument();
  });

  it("zeigt Glossar und Jahresrhythmus und filtert das Glossar mit der Suche", () => {
    renderWithProviders(<AufgabenkartenPage />, { route: "/hilfe/karten", path: "/hilfe/karten" });
    expect(screen.getByText("Was ist wann zu tun?")).toBeInTheDocument();
    expect(screen.getByText("Glossar der Vereinssprache")).toBeInTheDocument();
    expect(screen.getByText("Warteliste")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("karten_suche"), { target: { value: "Hero-Video" } });
    expect(screen.queryByText("Warteliste")).not.toBeInTheDocument();
    expect(screen.getAllByText("Hero-Video").length).toBeGreaterThan(0);
  });
});
