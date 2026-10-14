import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useRegionen";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { Veranstaltung } from "../../types/regionen";
import VeranstaltungKarte from "./VeranstaltungKarte";

vi.mock("./TeilnehmerPanel", () => ({
  default: ({ anwesenheitMoeglich }: { anwesenheitMoeglich: boolean }) => (
    <div data-testid="teilnehmer" data-anwesenheit={String(anwesenheitMoeglich)} />
  ),
}));
vi.mock("../../hooks/useRegionen", () => ({
  useVeranstaltungAktion: vi.fn(),
  useAnmeldungSetzen: vi.fn(),
  useVeranstaltungLoeschen: vi.fn(),
  useVeranstaltungAendern: vi.fn(),
  useVeranstaltungAnlegen: vi.fn(),
  useVeranstaltungBild: vi.fn(),
}));

function v(o: Partial<Veranstaltung> = {}): Veranstaltung {
  return {
    id: "v1",
    region: { slug: "nord", name: "Nord" },
    titel: "Derby-Abend",
    beschreibung: "Wir schauen zusammen.",
    datum: "2026-11-07",
    uhrzeit: "19:30",
    ort: "Hamburg, Kneipe X",
    standort: null,
    bild_url: null,
    max_teilnehmer: null,
    status: "veroeffentlicht",
    ablehngrund: "",
    ersteller_name: "Alex",
    teilnehmer_zahl: 4,
    angemeldet: false,
    kann_anmelden: true,
    darf_bearbeiten: false,
    darf_einreichen: false,
    darf_freigeben: false,
    darf_absagen: false,
    darf_anwesenheit: false,
    darf_abschliessen: false,
    darf_teilnehmer_sehen: false,
    ...o,
  };
}

const m = { aktion: vi.fn(), anmelden: vi.fn(), loeschen: vi.fn() };

function zeige(o: Partial<Veranstaltung> = {}) {
  const mut = (fn: ReturnType<typeof vi.fn>) => ({ mutate: fn, isPending: false }) as never;
  vi.mocked(hooks.useVeranstaltungAktion).mockReturnValue(mut(m.aktion));
  vi.mocked(hooks.useAnmeldungSetzen).mockReturnValue(mut(m.anmelden));
  vi.mocked(hooks.useVeranstaltungLoeschen).mockReturnValue(mut(m.loeschen));
  for (const k of [
    "useVeranstaltungAendern",
    "useVeranstaltungAnlegen",
    "useVeranstaltungBild",
  ] as const) {
    vi.mocked(hooks[k]).mockReturnValue(mut(vi.fn()));
  }
  return renderWithProviders(
    <ul>
      <VeranstaltungKarte v={v(o)} standorte={[]} />
    </ul>,
  );
}

describe("VeranstaltungKarte", () => {
  beforeEach(() => vi.clearAllMocks());

  it("zeigt Daten und für Leser nur Anmelden", () => {
    zeige();
    expect(screen.getByText("Derby-Abend")).toBeInTheDocument();
    expect(screen.getByText(/Hamburg, Kneipe X/)).toBeInTheDocument();
    expect(screen.getByText("status_veroeffentlicht")).toBeInTheDocument();
    expect(screen.queryByText("v_einreichen")).not.toBeInTheDocument();
    expect(screen.queryByText("v_teilnehmer")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("v_anmelden"));
    expect(m.anmelden).toHaveBeenCalledWith(
      { slug: "nord", id: "v1", aktiv: true },
      expect.any(Object),
    );
  });

  it("meldet ab, wenn schon angemeldet, auch bei vollem Treffen", () => {
    zeige({ angemeldet: true, kann_anmelden: false });
    fireEvent.click(screen.getByText("v_abmelden"));
    expect(m.anmelden).toHaveBeenCalledWith(
      { slug: "nord", id: "v1", aktiv: false },
      expect.any(Object),
    );
  });

  it("zeigt bei ausgebuchtem Treffen einen Hinweis statt Anmelden", () => {
    zeige({ kann_anmelden: false });
    expect(screen.getByText("v_nicht_anmeldbar")).toBeInTheDocument();
    expect(screen.queryByText("v_anmelden")).not.toBeInTheDocument();
  });

  it("Entwurf : einreichen und löschen für Verantwortliche", () => {
    zeige({ status: "entwurf", darf_einreichen: true, darf_bearbeiten: true });
    fireEvent.click(screen.getByText("v_einreichen"));
    expect(m.aktion).toHaveBeenCalledWith(
      { slug: "nord", id: "v1", aktion: "einreichen" },
      expect.any(Object),
    );
    fireEvent.click(screen.getByText("v_loeschen"));
    expect(m.loeschen).toHaveBeenCalledWith({ slug: "nord", id: "v1" }, expect.any(Object));
  });

  it("Büro : freigeben und nur mit Grund zurückweisen", () => {
    zeige({ status: "eingereicht", darf_freigeben: true });
    fireEvent.click(screen.getByText("v_freigeben"));
    expect(m.aktion).toHaveBeenLastCalledWith(
      { slug: "nord", id: "v1", aktion: "freigeben" },
      expect.any(Object),
    );
    fireEvent.click(screen.getByText("v_zurueckweisen"));
    const knopf = screen.getByText("v_zurueckweisen_bestaetigen");
    expect(knopf).toBeDisabled();
    fireEvent.change(screen.getByLabelText("v_grund"), { target: { value: "Termin kollidiert" } });
    fireEvent.click(knopf);
    expect(m.aktion).toHaveBeenLastCalledWith(
      { slug: "nord", id: "v1", aktion: "zurueckweisen", grund: "Termin kollidiert" },
      expect.any(Object),
    );
  });

  it("zeigt den Grund eines zurückgewiesenen Treffens", () => {
    zeige({ status: "zurueckgewiesen", ablehngrund: "Zu kurzfristig", darf_einreichen: true });
    expect(screen.getByText("v_zurueckgewiesen")).toBeInTheDocument();
    expect(screen.getByText("v_einreichen")).toBeInTheDocument();
  });

  it("Absagen verlangt eine Bestätigung", () => {
    zeige({ darf_absagen: true });
    fireEvent.click(screen.getByText("v_absagen"));
    expect(m.aktion).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("v_absagen_bestaetigen"));
    expect(m.aktion).toHaveBeenCalledWith(
      { slug: "nord", id: "v1", aktion: "absagen" },
      expect.any(Object),
    );
  });

  it("Büro schließt ab, Teilnehmerliste kennt die Anwesenheit", () => {
    zeige({ darf_abschliessen: true, darf_teilnehmer_sehen: true, darf_anwesenheit: true });
    fireEvent.click(screen.getByText("v_abschliessen"));
    expect(m.aktion).toHaveBeenCalledWith(
      { slug: "nord", id: "v1", aktion: "abschliessen" },
      expect.any(Object),
    );
    fireEvent.click(screen.getByText("v_teilnehmer"));
    expect(screen.getByTestId("teilnehmer")).toHaveAttribute("data-anwesenheit", "true");
  });

  it("zeigt Teilen mit beiden Texten und Link", () => {
    zeige({
      oeffentliche_url: "https://api.my-cid.de/api/v1/regionen/public/veranstaltungen/v1/",
      teilen: { de: "Komm vorbei!", fr: "Venez nombreux !" },
    });
    fireEvent.click(screen.getByText("v_teilen"));
    expect(screen.getByText("Komm vorbei!")).toBeInTheDocument();
    expect(screen.getByText("Venez nombreux !")).toBeInTheDocument();
    expect(screen.getByText(/regionen\/public\/veranstaltungen\/v1/)).toBeInTheDocument();
  });

  it("zeigt die Zahl der Anwesenden bei abgeschlossenen Treffen", () => {
    zeige({ status: "abgeschlossen", anwesende_zahl: 3 });
    expect(screen.getByText("v_anwesende")).toBeInTheDocument();
  });
});
