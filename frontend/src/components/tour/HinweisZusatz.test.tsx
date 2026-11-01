import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore, type CidUser } from "../../store/authStore";
import { renderWithProviders } from "../../test/renderWithProviders";
import HinweisZusatz from "./HinweisZusatz";

const hoch = vi.hoisted(() => ({
  zugriff: { accessible: true, modifiable: true, isLoading: false },
  regionen: undefined as unknown,
}));

vi.mock("../../hooks/useRbac", () => ({ usePageAccess: () => hoch.zugriff }));
vi.mock("../../hooks/useRegionen", () => ({ useRegionen: () => ({ data: hoch.regionen }) }));

function melde(extra: Partial<CidUser> = {}) {
  useAuthStore.setState({
    user: {
      id: "u1",
      email: "anna@example.org",
      role: "membre",
      langue_preferee: "de",
      ...extra,
    },
    isAuthenticated: true,
  });
}

function region(meine: boolean, eigene = false) {
  return { meine_region: meine, verantwortliche: [{ eigene }] };
}

describe("HinweisZusatz", () => {
  beforeEach(() => {
    hoch.zugriff = { accessible: true, modifiable: true, isLoading: false };
    hoch.regionen = undefined;
    melde();
  });

  it("weist auf Verwaltungsseiten mit nur Leserechten hin", () => {
    hoch.zugriff = { accessible: true, modifiable: false, isLoading: false };
    renderWithProviders(<HinweisZusatz hinweisKey="finanzen" pageSlug="page_finances" />);
    expect(screen.getByText("hinweise_zusatz.nur_lesen")).toBeInTheDocument();
  });

  it("schweigt bei Schreibrecht, ohne Zugriff und während die Rechte laden", () => {
    for (const z of [
      { accessible: true, modifiable: true, isLoading: false },
      { accessible: false, modifiable: false, isLoading: false },
      { accessible: true, modifiable: false, isLoading: true },
    ]) {
      hoch.zugriff = z;
      const { unmount } = renderWithProviders(
        <HinweisZusatz hinweisKey="finanzen" pageSlug="page_finances" />,
      );
      expect(screen.queryByText("hinweise_zusatz.nur_lesen")).not.toBeInTheDocument();
      unmount();
    }
  });

  it("Seiten ohne Zugriffsstufe (Mitgliederseiten) bekommen keine Lesezeile", () => {
    hoch.zugriff = { accessible: true, modifiable: false, isLoading: false };
    renderWithProviders(<HinweisZusatz hinweisKey="forum" />);
    expect(screen.queryByText("hinweise_zusatz.nur_lesen")).not.toBeInTheDocument();
  });

  it("Sektoren : Zeilen je nach Zuordnung", () => {
    hoch.regionen = {
      ohne_region: false,
      darf_freigeben: true,
      ergebnisse: [region(true, true), region(false)],
    };
    renderWithProviders(<HinweisZusatz hinweisKey="regionen" />);
    expect(screen.getByText("hinweise_zusatz.region_meine")).toBeInTheDocument();
    expect(screen.getByText("hinweise_zusatz.region_verantwortlich")).toBeInTheDocument();
    expect(screen.getByText("hinweise_zusatz.region_freigeben")).toBeInTheDocument();
    expect(screen.queryByText("hinweise_zusatz.region_keine")).not.toBeInTheDocument();
  });

  it("Sektoren : ohne Zuordnung nur der Hinweis darauf", () => {
    hoch.regionen = { ohne_region: true, darf_freigeben: false, ergebnisse: [region(false)] };
    renderWithProviders(<HinweisZusatz hinweisKey="regionen" />);
    expect(screen.getByText("hinweise_zusatz.region_keine")).toBeInTheDocument();
    expect(screen.queryByText("hinweise_zusatz.region_meine")).not.toBeInTheDocument();
    expect(screen.queryByText("hinweise_zusatz.region_verantwortlich")).not.toBeInTheDocument();
  });

  it("Sektoren : solange nichts geladen ist, keine Zeile", () => {
    renderWithProviders(<HinweisZusatz hinweisKey="regionen" />);
    expect(document.querySelector("p")).toBeNull();
  });

  it("Fans sehen auf Meine Mitgliedschaft den Hinweis zum Mitglied werden", () => {
    melde({ ist_fan: true });
    renderWithProviders(<HinweisZusatz hinweisKey="mitgliedschaft" />);
    expect(screen.getByText("hinweise_zusatz.fan_mitglied")).toBeInTheDocument();
  });

  it("Mitglieder sehen diesen Hinweis nicht", () => {
    renderWithProviders(<HinweisZusatz hinweisKey="mitgliedschaft" />);
    expect(screen.queryByText("hinweise_zusatz.fan_mitglied")).not.toBeInTheDocument();
  });
});
