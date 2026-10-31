import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import NaechsterSchritt from "./NaechsterSchritt";
import { schrittArt } from "./naechsterSchritt";
import Kennzahlen from "./Kennzahlen";

describe("schrittArt", () => {
  const s = (statut: string) => ({ statut }) as never;

  it("ohne Kampagne gibt es keinen Schritt", () => {
    expect(schrittArt({ hatKampagne: false, souscription: undefined, tage: null })).toBeNull();
  });

  it.each([
    [undefined, null, "beitreten"],
    ["brouillon", null, "zahlung"],
    ["en_attente_paiement", null, "zahlung"],
    ["en_attente_justificatif", null, "nachweis"],
    ["rabais_refuse", null, "abgelehnt"],
    ["annulee", null, "wieder"],
    ["expiree", null, "wieder"],
    ["payee", 120, "ok"],
    ["payee", null, "ok"],
    ["payee", 30, "bald"],
    ["payee", 3, "bald"],
  ] as const)("%s mit %s Tagen → %s", (statut, tage, erwartet) => {
    expect(
      schrittArt({ hatKampagne: true, souscription: statut ? s(statut) : undefined, tage }),
    ).toBe(erwartet);
  });
});

describe("NaechsterSchritt", () => {
  it("der Knopf springt zum passenden Bereich", () => {
    const onZiel = vi.fn();
    renderWithProviders(<NaechsterSchritt art="nachweis" tage={null} onZiel={onZiel} />);
    expect(screen.getByRole("region", { name: "naechster.kicker" })).toHaveAttribute(
      "data-schritt",
      "nachweis",
    );
    fireEvent.click(screen.getByRole("button", { name: "naechster.nachweis_knopf" }));
    expect(onZiel).toHaveBeenCalledWith("nachweis");
  });

  it.each([
    ["zahlung", "zahlung"],
    ["abgelehnt", "angebote"],
    ["beitreten", "angebote"],
    ["wieder", "angebote"],
  ] as const)("%s springt zu %s", (art, ziel) => {
    const onZiel = vi.fn();
    renderWithProviders(<NaechsterSchritt art={art} tage={null} onZiel={onZiel} />);
    fireEvent.click(screen.getByRole("button", { name: `naechster.${art}_knopf` }));
    expect(onZiel).toHaveBeenCalledWith(ziel);
  });

  it("ok hat keinen Sprung-Knopf, aber Links zu Shop und Veranstaltungen", () => {
    renderWithProviders(<NaechsterSchritt art="ok" tage={200} onZiel={vi.fn()} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("link", { name: "naechster.ok_shop" })).toHaveAttribute(
      "href",
      "/boutique",
    );
    expect(screen.getByRole("link", { name: "naechster.ok_events" })).toHaveAttribute(
      "href",
      "/evenements",
    );
  });

  it("bald hat keinen Knopf (es gibt noch nichts zu tun)", () => {
    renderWithProviders(<NaechsterSchritt art="bald" tage={12} onZiel={vi.fn()} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("Kennzahlen", () => {
  it("zeigt Tage, Jahre und Mitglied seit", () => {
    renderWithProviders(<Kennzahlen tage={42} jahre={3} seit={2023} />);
    const box = screen.getByTestId("kennzahlen");
    expect(box).toHaveTextContent("42");
    expect(box).toHaveTextContent("3");
    expect(box).toHaveTextContent("2023");
  });

  it("lässt fehlende Werte weg und rendert ohne alles nichts", () => {
    renderWithProviders(<Kennzahlen tage={10} jahre={0} seit={null} />);
    expect(screen.getByTestId("kennzahlen").children).toHaveLength(1);
  });

  it("rendert nichts ohne Werte", () => {
    renderWithProviders(<Kennzahlen />);
    expect(screen.queryByTestId("kennzahlen")).toBeNull();
  });
});
