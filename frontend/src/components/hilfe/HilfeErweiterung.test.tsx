/** Hilfe gesucht: Ansichten, Kategorien-Verwaltung und Angebote der Mitglieder. */
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useProjets";
import { useAuthStore } from "../../store/authStore";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { HilfeAngebot, HilfeKategorie, ProjetStelle } from "../../types/projets";
import HilfeGesuchtInhalt from "./HilfeGesuchtInhalt";

vi.mock("../../hooks/useProjets", async () => {
  const actual = await vi.importActual<typeof hooks>("../../hooks/useProjets");
  return {
    ...actual,
    useOffeneStellen: vi.fn(),
    useFreieStellen: vi.fn(),
    useHilfeKategorien: vi.fn(),
    useHilfeKategorieSpeichern: vi.fn(),
    useHilfeKategorieLoeschen: vi.fn(),
    useHilfeAngebote: vi.fn(),
    useHilfeAngebotErstellen: vi.fn(),
    useHilfeAngebotZurueckziehen: vi.fn(),
    useHilfeAngebotEntscheiden: vi.fn(),
    useStelleBewerben: vi.fn(),
    useStelleZurueckziehen: vi.fn(),
    useStelleAendern: vi.fn(),
    useStelleLoeschen: vi.fn(),
    useStelleErstellen: vi.fn(),
    useBewerbungen: vi.fn(),
    useBewerbungEmpfehlen: vi.fn(),
    useBewerbungEntscheiden: vi.fn(),
    usePassendeMitglieder: vi.fn(),
  };
});
vi.mock("../../hooks/useFaehigkeiten", () => ({ useFaehigkeitenKatalog: () => ({ data: [] }) }));
vi.mock("../../hooks/useRegionen", () => ({ useRegionen: () => ({ data: { ergebnisse: [] } }) }));
vi.mock("../ui/RichTextEditor", () => ({
  default: ({
    value,
    onChange,
    ariaLabel,
  }: {
    value: string;
    onChange: (v: string) => void;
    ariaLabel?: string;
  }) => (
    <textarea aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

const speichern = vi.fn();
const loeschen = vi.fn();
const erstellen = vi.fn();
const zurueckziehen = vi.fn();
const entscheiden = vi.fn();
const stelleErstellen = vi.fn();

const kategorie = (o: Partial<HilfeKategorie> = {}): HilfeKategorie => ({
  id: "k1",
  name_de: "Fest & Organisation",
  name_fr: "Fêtes & organisation",
  aktiv: true,
  reihenfolge: 10,
  anzahl: 2,
  ...o,
});

const angebot = (o: Partial<HilfeAngebot> = {}): HilfeAngebot => ({
  id: "a1",
  membre: "m1",
  membre_detail: { id: "m1", prenom: "Anna", nom: "Beispiel" },
  kategorie: "k1",
  kategorie_detail: { id: "k1", name_de: "Fest & Organisation", name_fr: "Fêtes", aktiv: true },
  titel: "Ich helfe gern bei Festen",
  beschreibung: "<p>Kann <strong>backen</strong></p>",
  verfuegbarkeit: "Samstags",
  status: "offen",
  stelle: null,
  stelle_titel: null,
  notiz: "",
  ist_meins: false,
  created_at: "2026-11-10T10:00:00Z",
  ...o,
});

const gesuch = (o: Partial<ProjetStelle> = {}) =>
  ({
    id: "s1",
    projet: null,
    projet_titre: null,
    frei: true,
    titel: "Stand beim Heimspiel",
    beschreibung: "<p>Aufbau <em>ab 10 Uhr</em></p>",
    faehigkeit: null,
    faehigkeit_name: null,
    anzahl: 1,
    status: "offen",
    art: "dauerhaft",
    termin: null,
    ort: "",
    frist: null,
    sichtbarkeit: "mitglieder",
    region: null,
    angenommen: 0,
    freie_plaetze: 1,
    meine_bewerbung: null,
    bewerbungen_offen: null,
    bewerbungen_empfohlen: null,
    kann_pflegen: false,
    ist_meine: false,
    created_at: "2026-11-01T10:00:00Z",
    kategorie: "k1",
    kategorie_detail: { id: "k1", name_de: "Fest & Organisation", name_fr: "Fêtes", aktiv: true },
    ...o,
  }) as ProjetStelle;

const q = <T,>(data: T) => ({ data, isLoading: false }) as never;
const m = (fn: unknown) => ({ mutate: fn, isPending: false }) as never;

function bereit(rolle: "membre" | "bureau_admin", gesuche: ProjetStelle[] = [gesuch()]) {
  useAuthStore.setState({ isAuthenticated: true, user: { role: rolle } as never });
  vi.mocked(hooks.useOffeneStellen).mockReturnValue(q(gesuche));
  vi.mocked(hooks.useFreieStellen).mockReturnValue(q(gesuche));
  vi.mocked(hooks.useHilfeKategorien).mockReturnValue(
    q([kategorie(), kategorie({ id: "k2", name_de: "Technik", name_fr: "Technique", anzahl: 0 })]),
  );
  vi.mocked(hooks.useHilfeAngebote).mockReturnValue(q([angebot()]));
}

beforeEach(() => {
  for (const f of [speichern, loeschen, erstellen, zurueckziehen, entscheiden, stelleErstellen]) {
    f.mockReset();
  }
  vi.mocked(hooks.useHilfeKategorieSpeichern).mockReturnValue(m(speichern));
  vi.mocked(hooks.useHilfeKategorieLoeschen).mockReturnValue(m(loeschen));
  vi.mocked(hooks.useHilfeAngebotErstellen).mockReturnValue(m(erstellen));
  vi.mocked(hooks.useHilfeAngebotZurueckziehen).mockReturnValue(m(zurueckziehen));
  vi.mocked(hooks.useHilfeAngebotEntscheiden).mockReturnValue(m(entscheiden));
  vi.mocked(hooks.useStelleErstellen).mockReturnValue(m(stelleErstellen));
  for (const h of [
    hooks.useStelleBewerben,
    hooks.useStelleZurueckziehen,
    hooks.useStelleAendern,
    hooks.useStelleLoeschen,
    hooks.useBewerbungEmpfehlen,
    hooks.useBewerbungEntscheiden,
  ]) {
    vi.mocked(h).mockReturnValue(m(vi.fn()));
  }
  vi.mocked(hooks.useBewerbungen).mockReturnValue(q([]));
  vi.mocked(hooks.usePassendeMitglieder).mockReturnValue(q([]));
});
afterEach(() => cleanup());

describe("Ansichten", () => {
  it("Mitglieder sehen Gesuche und ihre Angebote, aber keine Kategorien-Pflege", () => {
    bereit("membre");
    renderWithProviders(<HilfeGesuchtInhalt />);
    expect(screen.getByRole("button", { name: "hilfe.ansicht.gesuche" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "hilfe.ansicht.meine_angebote" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "hilfe.ansicht.kategorien" })).toBeNull();
  });

  it("das Büro hat zusätzlich die Kategorien", () => {
    bereit("bureau_admin");
    renderWithProviders(<HilfeGesuchtInhalt />);
    expect(screen.getByRole("button", { name: "hilfe.ansicht.angebote" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "hilfe.ansicht.kategorien" })).toBeInTheDocument();
  });

  it("ohne Anmeldung gibt es nur die Gesuche", () => {
    bereit("membre");
    useAuthStore.setState({ isAuthenticated: false, user: null });
    renderWithProviders(<HilfeGesuchtInhalt oeffentlich />);
    expect(screen.queryByRole("group", { name: "hilfe.ansicht.label" })).toBeNull();
    expect(screen.getByText("Stand beim Heimspiel")).toBeInTheDocument();
  });

  it("zeigt die Beschreibung formatiert und die Kategorie als Marke", () => {
    bereit("membre");
    renderWithProviders(<HilfeGesuchtInhalt />);
    expect(screen.getByText("ab 10 Uhr").tagName).toBe("EM");
    const marke = [
      ...screen.queryAllByText("Fêtes"),
      ...screen.queryAllByText("Fest & Organisation"),
    ];
    expect(marke.length).toBeGreaterThan(0);
  });

  it("filtert die Gesuche nach Kategorie", () => {
    bereit("membre", [
      gesuch(),
      gesuch({ id: "s2", titel: "Website pflegen", kategorie: "k2", kategorie_detail: null }),
    ]);
    renderWithProviders(<HilfeGesuchtInhalt />);
    fireEvent.change(screen.getByLabelText("hilfe.filter.kategorie"), { target: { value: "k2" } });
    expect(screen.queryByText("Stand beim Heimspiel")).toBeNull();
    expect(screen.getByText("Website pflegen")).toBeInTheDocument();
  });

  it("das Gesuch-Formular schickt Kategorie und formatierte Beschreibung mit", () => {
    bereit("bureau_admin");
    renderWithProviders(<HilfeGesuchtInhalt />);
    fireEvent.click(screen.getByRole("button", { name: /hilfe\.neu/ }));
    fireEvent.change(screen.getByLabelText("stellen.titel_label"), { target: { value: "Aufbau" } });
    fireEvent.change(screen.getByLabelText("hilfe.form.kategorie"), { target: { value: "k2" } });
    fireEvent.change(screen.getByLabelText("stellen.beschreibung_label"), {
      target: { value: "<p>Mit <strong>Hand</strong></p>" },
    });
    fireEvent.change(screen.getByLabelText("hilfe.form.termin"), {
      target: { value: "2027-05-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "hilfe.form.veroeffentlichen" }));
    expect(stelleErstellen).toHaveBeenCalledWith(
      expect.objectContaining({
        titel: "Aufbau",
        kategorie: "k2",
        beschreibung: "<p>Mit <strong>Hand</strong></p>",
      }),
      expect.anything(),
    );
  });
});

describe("Kategorien verwalten", () => {
  function oeffnen() {
    bereit("bureau_admin");
    renderWithProviders(<HilfeGesuchtInhalt />, { route: "/?ansicht=kategorien" });
  }

  it("legt eine Kategorie mit deutschem und französischem Namen an", () => {
    oeffnen();
    fireEvent.change(screen.getByLabelText("hilfe.kat.name_de"), { target: { value: "Garten" } });
    fireEvent.change(screen.getByLabelText("hilfe.kat.name_fr"), { target: { value: "Jardin" } });
    fireEvent.click(screen.getByRole("button", { name: "hilfe.kat.hinzufuegen" }));
    expect(speichern).toHaveBeenCalledWith(
      { daten: { name_de: "Garten", name_fr: "Jardin", reihenfolge: 20 } },
      expect.anything(),
    );
  });

  it("benennt um, deaktiviert und löscht", () => {
    oeffnen();
    const zeilen = screen.getAllByTestId("kategorie-zeile");
    expect(zeilen).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "hilfe.kat.deaktivieren" })[0]);
    expect(speichern).toHaveBeenCalledWith({ id: "k1", daten: { aktiv: false } });
    fireEvent.click(screen.getAllByRole("button", { name: "hilfe.kat.bearbeiten" })[1]);
    const felder = screen.getAllByLabelText("hilfe.kat.name_de");
    fireEvent.change(felder[felder.length - 1], { target: { value: "IT" } });
    fireEvent.click(screen.getByRole("button", { name: "hilfe.kat.speichern" }));
    expect(speichern).toHaveBeenCalledWith(
      { id: "k2", daten: { name_de: "IT", name_fr: "Technique", reihenfolge: 10 } },
      expect.anything(),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getAllByRole("button", { name: "hilfe.kat.loeschen" })[0]);
    expect(loeschen).toHaveBeenCalledWith("k1");
  });

  it("Mitglieder kommen nicht an die Kategorien-Pflege", () => {
    bereit("membre");
    renderWithProviders(<HilfeGesuchtInhalt />, { route: "/?ansicht=kategorien" });
    expect(screen.queryByTestId("kategorie-zeile")).toBeNull();
    expect(screen.getByText("Stand beim Heimspiel")).toBeInTheDocument();
  });
});

describe("Angebote der Mitglieder", () => {
  it("ein Mitglied bietet Hilfe an", () => {
    bereit("membre");
    vi.mocked(hooks.useHilfeAngebote).mockReturnValue(q([angebot({ ist_meins: true })]));
    renderWithProviders(<HilfeGesuchtInhalt />, { route: "/?ansicht=angebote" });
    fireEvent.click(screen.getByRole("button", { name: /hilfe\.angebot\.neu/ }));
    fireEvent.change(screen.getByLabelText("hilfe.angebot.thema"), { target: { value: "Backen" } });
    fireEvent.change(screen.getByLabelText("hilfe.form.kategorie"), { target: { value: "k1" } });
    fireEvent.change(screen.getByLabelText("hilfe.angebot.verfuegbarkeit"), {
      target: { value: "Samstags" },
    });
    fireEvent.click(screen.getByRole("button", { name: "hilfe.angebot.senden" }));
    expect(erstellen).toHaveBeenCalledWith(
      { titel: "Backen", kategorie: "k1", beschreibung: "", verfuegbarkeit: "Samstags" },
      expect.anything(),
    );
  });

  it("ein Mitglied zieht das eigene Angebot zurück und sieht keine Entscheidungs-Knöpfe", () => {
    bereit("membre");
    vi.mocked(hooks.useHilfeAngebote).mockReturnValue(q([angebot({ ist_meins: true })]));
    renderWithProviders(<HilfeGesuchtInhalt />, { route: "/?ansicht=angebote" });
    expect(screen.queryByRole("button", { name: "hilfe.angebot.annehmen" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "hilfe.angebot.zurueckziehen" }));
    expect(zurueckziehen).toHaveBeenCalledWith("a1");
  });

  it("das Büro nimmt ein Angebot an, optional mit Zuordnung zu einem offenen Gesuch", () => {
    bereit("bureau_admin");
    renderWithProviders(<HilfeGesuchtInhalt />, { route: "/?ansicht=angebote" });
    expect(screen.getByText("Anna Beispiel")).toBeInTheDocument();
    expect(screen.getByText("backen").tagName).toBe("STRONG");
    fireEvent.change(screen.getByLabelText("hilfe.angebot.zuordnen"), { target: { value: "s1" } });
    fireEvent.change(screen.getByLabelText("hilfe.angebot.notiz_label"), {
      target: { value: "Wir melden uns" },
    });
    fireEvent.click(screen.getByRole("button", { name: "hilfe.angebot.annehmen" }));
    expect(entscheiden).toHaveBeenCalledWith(
      { id: "a1", entscheidung: "annehmen", extra: { notiz: "Wir melden uns", stelle: "s1" } },
      expect.anything(),
    );
  });

  it("das Büro lehnt ab (ohne Zuordnung)", () => {
    bereit("bureau_admin");
    renderWithProviders(<HilfeGesuchtInhalt />, { route: "/?ansicht=angebote" });
    fireEvent.click(screen.getByRole("button", { name: "hilfe.angebot.ablehnen" }));
    expect(entscheiden).toHaveBeenCalledWith(
      { id: "a1", entscheidung: "ablehnen", extra: { notiz: "" } },
      expect.anything(),
    );
  });

  it("bearbeitete Angebote zeigen Status, Zuordnung und Büro-Nachricht", () => {
    bereit("membre");
    vi.mocked(hooks.useHilfeAngebote).mockReturnValue(
      q([
        angebot({
          ist_meins: true,
          status: "angenommen",
          stelle_titel: "Stand beim Heimspiel",
          notiz: "Danke!",
        }),
      ]),
    );
    renderWithProviders(<HilfeGesuchtInhalt />, { route: "/?ansicht=angebote" });
    expect(screen.getByText("hilfe.angebot.status.angenommen")).toBeInTheDocument();
    expect(screen.getByText(/hilfe\.angebot\.zugeordnet/)).toBeInTheDocument();
    expect(screen.getByText(/Danke!/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "hilfe.angebot.zurueckziehen" })).toBeNull();
  });
});
