import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as useAdhesionsHooks from "../../hooks/useAdhesions";
import { renderWithProviders } from "../../test/renderWithProviders";
import type {
  CampagneAdhesion,
  FamilienErwachsener,
  OffreAdhesion,
  Souscription,
} from "../../types/adhesion";
import FamilienBereich from "./FamilienBereich";
import FamilienBericht from "./FamilienBericht";
import FamilienErfassung from "./FamilienErfassung";
import FamilienpaketeBuero from "./FamilienpaketeBuero";
import { LEERE_FAMILIE, berechnePaket, familieVollstaendig } from "./familienpreis";

vi.mock("../../hooks/useAdhesions", async () => {
  const actual = await vi.importActual<typeof useAdhesionsHooks>("../../hooks/useAdhesions");
  return {
    ...actual,
    useKindLoeschen: vi.fn(),
    useErwachsenerAendern: vi.fn(),
    useEinladungErneutSenden: vi.fn(),
    usePersonAngebot: vi.fn(),
    useFamilienpakete: vi.fn(),
    useFamilienbericht: vi.fn(),
    useVorjahrFamilie: vi.fn(),
  };
});

function angebot(id: string, nom: string, preis: string, extra: Partial<OffreAdhesion> = {}) {
  return { id, nom, prix_plein: preis, ist_familienpaket: false, ...extra } as OffreAdhesion;
}

const PLUS = angebot("o2", "CID-PLUS", "50.00");
const JUNIOR = angebot("o3", "CID-JUNIOR", "10.00");
const PAKET = angebot("o1", "Familie", "50.00", {
  ist_familienpaket: true,
  familie_rabatt_pct: "10.00",
  familie_angebot_hauptperson: "o2",
  familie_angebot_erwachsene: "o2",
  familie_angebot_kinder: "o3",
  max_erwachsene: 2,
  max_kinder: 3,
});
const ANGEBOTE = [PAKET, PLUS, JUNIOR];
const KAMPAGNE = {
  id: "c1",
  nom: "Test 2026",
  annee: 2026,
  familie_max_alter_kind: 17,
  offres: ANGEBOTE,
} as CampagneAdhesion;

function erwachsener(overrides: Partial<FamilienErwachsener> = {}): FamilienErwachsener {
  return {
    id: "e1",
    vorname: "Nora",
    nachname: "Muster",
    email: "nora@example.de",
    beziehung: "ehepartner",
    status: "eingeladen",
    angebot: "CID-PLUS",
    preis_liste: "50.00",
    preis_anteil: "45.00",
    anonymisiert: false,
    ...overrides,
  };
}

function souscription(overrides: Partial<Souscription> = {}): Souscription {
  return {
    id: "s1",
    membre: "m1",
    offre: "o1",
    campagne: "c1",
    date_souscription: "2026-02-01T10:00:00Z",
    prix_paye: "108.00",
    rabais: null,
    statut: "payee",
    cotisation: null,
    snapshot_avantages: [],
    plaetze_erwachsene: 1,
    plaetze_kinder: 2,
    kinder: [
      {
        id: "k1",
        vorname: "Lina",
        nachname: "Muster",
        geburtsjahr: 2018,
        alter: 8,
        beziehung: "kind",
        kartennummer: "CA-2026-001-J1",
        angebot: "CID-JUNIOR",
        kartenstil: "gold",
        preis_liste: "10.00",
        preis_anteil: "9.00",
        einwilligung_am: "2026-02-02T10:00:00Z",
        anonymisiert: false,
        ueber_hoechstalter: false,
      },
    ],
    erwachsene: [erwachsener()],
    familien_info: {
      rolle: "hauptperson",
      rabatt_pct: "10.00",
      gesamtpreis: "108.00",
      angebot: "CID-PLUS",
      kartenstil: "gold",
    },
    justificatif: null,
    created_at: "2026-02-01T10:00:00Z",
    updated_at: "2026-02-01T10:00:00Z",
    ...overrides,
  };
}

describe("berechnePaket", () => {
  it("Summe der zugewiesenen Angebote minus Familienrabatt in Prozent", () => {
    const paket = berechnePaket(PAKET, ANGEBOTE, 1, 2);
    expect(paket?.liste).toBe(120);
    expect(paket?.gesamt).toBe(108);
    expect(paket?.positionen.map((p) => p.anteil)).toEqual([45, 45, 9, 9]);
  });

  it("ohne Weitere zahlt nur die Hauptperson ihr Angebot nach Rabatt", () => {
    expect(berechnePaket(PAKET, ANGEBOTE, 0, 0)?.gesamt).toBe(45);
  });

  it("Hauptperson ohne eigene Zuweisung erhält das Erwachsenenangebot", () => {
    const ohne = { ...PAKET, familie_angebot_hauptperson: null };
    expect(berechnePaket(ohne, ANGEBOTE, 0, 0)?.positionen[0].angebot.nom).toBe("CID-PLUS");
  });

  it("ohne Zuweisung gibt es keinen Preis", () => {
    const leer = { ...PAKET, familie_angebot_erwachsene: null, familie_angebot_hauptperson: null };
    expect(berechnePaket(leer, ANGEBOTE, 0, 0)).toBeNull();
    expect(berechnePaket({ ...PAKET, familie_angebot_kinder: null }, ANGEBOTE, 0, 1)).toBeNull();
  });
});

describe("familieVollstaendig", () => {
  const erw = { vorname: "Nora", nachname: "Muster", email: "nora@example.de", beziehung: "kind" };
  const kind = { vorname: "Lina", nachname: "Muster", geburtsjahr: "2018", beziehung: "kind" };

  it("verlangt mindestens eine weitere Person", () => {
    expect(familieVollstaendig(LEERE_FAMILIE)).toBe(false);
  });

  it("verlangt Name, gültige E-Mail und Beziehung bei Erwachsenen", () => {
    const ok = { ...LEERE_FAMILIE, erwachsene: [{ ...erw, beziehung: "ehepartner" as const }] };
    expect(familieVollstaendig(ok)).toBe(true);
    expect(familieVollstaendig({ ...ok, erwachsene: [{ ...ok.erwachsene[0], email: "x" }] })).toBe(
      false,
    );
    expect(
      familieVollstaendig({ ...ok, erwachsene: [{ ...ok.erwachsene[0], beziehung: "" }] }),
    ).toBe(false);
  });

  it("verlangt bei Kindern Geburtsjahr und Einwilligung", () => {
    const f = { ...LEERE_FAMILIE, kinder: [{ ...kind, beziehung: "kind" as const }] };
    expect(familieVollstaendig(f)).toBe(false);
    expect(familieVollstaendig({ ...f, einwilligung: true })).toBe(true);
    expect(
      familieVollstaendig({
        ...f,
        einwilligung: true,
        kinder: [{ ...f.kinder[0], geburtsjahr: "" }],
      }),
    ).toBe(false);
  });
});

function vorjahr(data: unknown) {
  vi.mocked(useAdhesionsHooks.useVorjahrFamilie).mockReturnValue({
    data,
  } as unknown as ReturnType<typeof useAdhesionsHooks.useVorjahrFamilie>);
}

describe("FamilienErfassung", () => {
  beforeEach(() => vorjahr(undefined));

  it("bietet an, die Familie aus dem Vorjahr zu übernehmen (Einwilligung bleibt offen)", () => {
    vorjahr({
      quelle: "Kampagne 2025",
      erwachsene: [
        { vorname: "Nora", nachname: "Muster", email: "nora@example.de", beziehung: "ehepartner" },
      ],
      kinder: [{ vorname: "Lina", nachname: "Muster", geburtsjahr: 2018, beziehung: "kind" }],
      aelter_geworden: [
        { vorname: "Max", nachname: "Muster", geburtsjahr: 2007, beziehung: "kind" },
      ],
    });
    const onChange = vi.fn();
    renderWithProviders(
      <FamilienErfassung
        offre={PAKET}
        campagne={KAMPAGNE}
        wert={LEERE_FAMILIE}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("familie.vorjahr_uebernehmen"));
    const neu = onChange.mock.calls[0][0];
    expect(neu.einwilligung).toBe(false);
    expect(neu.kinder).toEqual([
      { vorname: "Lina", nachname: "Muster", geburtsjahr: "2018", beziehung: "kind" },
    ]);
    // Max ist zu alt für die Kampagne : Erwachsener ohne E-Mail, wird ergänzt.
    expect(neu.erwachsene.map((e: { vorname: string }) => e.vorname)).toEqual(["Nora", "Max"]);
    expect(neu.erwachsene[1].email).toBe("");
    expect(familieVollstaendig(neu)).toBe(false);
  });

  it("zeigt kein Angebot zum Übernehmen ohne Vorschlag oder bei bereits erfassten Personen", () => {
    vorjahr({ quelle: null, erwachsene: [], kinder: [], aelter_geworden: [] });
    renderWithProviders(
      <FamilienErfassung
        offre={PAKET}
        campagne={KAMPAGNE}
        wert={LEERE_FAMILIE}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByText("familie.vorjahr_uebernehmen")).not.toBeInTheDocument();
  });

  it("begrenzt die Übernahme auf die Obergrenzen des Angebots", () => {
    vorjahr({
      quelle: "Kampagne 2025",
      erwachsene: [],
      kinder: [
        { vorname: "A", nachname: "M", geburtsjahr: 2018, beziehung: "kind" },
        { vorname: "B", nachname: "M", geburtsjahr: 2019, beziehung: "kind" },
      ],
      aelter_geworden: [],
    });
    const onChange = vi.fn();
    renderWithProviders(
      <FamilienErfassung
        offre={{ ...PAKET, max_kinder: 1 }}
        campagne={KAMPAGNE}
        wert={LEERE_FAMILIE}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("familie.vorjahr_uebernehmen"));
    expect(onChange.mock.calls[0][0].kinder).toHaveLength(1);
  });

  it("begrenzt die Personen auf die Obergrenzen und meldet Änderungen", () => {
    const onChange = vi.fn();
    renderWithProviders(
      <FamilienErfassung
        offre={{ ...PAKET, max_erwachsene: 1, max_kinder: 1 }}
        campagne={KAMPAGNE}
        wert={{
          ...LEERE_FAMILIE,
          erwachsene: [{ vorname: "", nachname: "", email: "", beziehung: "" }],
        }}
        onChange={onChange}
      />,
    );
    // Obergrenze 1 Erwachsener erreicht, ein Kind noch möglich.
    expect(screen.queryByText("familie.erwachsenen_hinzufuegen")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("familie.kind_hinzufuegen"));
    expect(onChange.mock.calls[0][0].kinder).toHaveLength(1);
  });

  it("zeigt die Aufteilung des Preises je Person", () => {
    renderWithProviders(
      <FamilienErfassung
        offre={PAKET}
        campagne={KAMPAGNE}
        wert={{
          ...LEERE_FAMILIE,
          erwachsene: [{ vorname: "", nachname: "", email: "", beziehung: "" }],
        }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getAllByText("45,00 €")).toHaveLength(2); // 2 × 50 nach 10 % Rabatt
  });
});

describe("FamilienBereich", () => {
  const loeschen = vi.fn();
  const aendern = vi.fn();
  const senden = vi.fn();

  beforeEach(() => {
    loeschen.mockReset();
    aendern.mockReset();
    senden.mockReset();
    const stub = (mutate: ReturnType<typeof vi.fn>) =>
      ({ mutate, isPending: false, isError: false, isSuccess: false }) as never;
    vi.mocked(useAdhesionsHooks.useKindLoeschen).mockReturnValue(stub(loeschen));
    vi.mocked(useAdhesionsHooks.useErwachsenerAendern).mockReturnValue(stub(aendern));
    vi.mocked(useAdhesionsHooks.useEinladungErneutSenden).mockReturnValue(stub(senden));
  });

  function bereich(s: Souscription) {
    return renderWithProviders(
      <FamilienBereich souscription={s} kampagne="Test 2026" gueltigBis="31.12.2026" />,
    );
  }

  it("zeigt je Kind eine Junior-Karte mit eigener Nummer, sobald bezahlt", () => {
    bereich(souscription());
    expect(screen.getAllByText(/Lina Muster/).length).toBeGreaterThan(0);
    expect(screen.getByText("CA-2026-001-J1")).toBeInTheDocument();
  });

  it("zeigt vor der Zahlung keine Karte und keine Einladung", () => {
    bereich(
      souscription({
        statut: "en_attente_paiement",
        erwachsene: [erwachsener({ status: "offen" })],
      }),
    );
    expect(screen.queryByText("CA-2026-001-J1")).not.toBeInTheDocument();
    expect(screen.getByText("familie.karten_nach_zahlung")).toBeInTheDocument();
    expect(screen.getByText("familie.einladung_nach_zahlung")).toBeInTheDocument();
    expect(screen.queryByText("familie.erneut_senden")).not.toBeInTheDocument();
  });

  it("zeigt den Einladungsstatus der Erwachsenen und sendet erneut", () => {
    bereich(souscription());
    expect(screen.getByText("familie.status_eingeladen")).toBeInTheDocument();
    fireEvent.click(screen.getByText("familie.erneut_senden"));
    expect(senden.mock.calls[0][0]).toEqual({ souscriptionId: "s1", erwachsenerId: "e1" });
  });

  it("korrigiert Name und E-Mail einer noch nicht angenommenen Einladung", () => {
    bereich(souscription());
    fireEvent.click(screen.getByText("familie.korrigieren"));
    fireEvent.change(screen.getByLabelText("familie.email"), {
      target: { value: "richtig@example.de" },
    });
    fireEvent.click(screen.getByText("familie.speichern"));
    expect(aendern.mock.calls[0][0]).toEqual({
      souscriptionId: "s1",
      erwachsenerId: "e1",
      payload: { vorname: "Nora", nachname: "Muster", email: "richtig@example.de" },
    });
  });

  it("angenommene Mitglieder sind nicht mehr änderbar", () => {
    bereich(souscription({ erwachsene: [erwachsener({ status: "angenommen" })] }));
    expect(screen.getByText("familie.status_angenommen")).toBeInTheDocument();
    expect(screen.queryByText("familie.korrigieren")).not.toBeInTheDocument();
    expect(screen.queryByText("familie.erneut_senden")).not.toBeInTheDocument();
  });

  it("weist bei Konflikt auf die Klärung durch das Büro hin", () => {
    bereich(souscription({ erwachsene: [erwachsener({ status: "konflikt" })] }));
    expect(screen.getByText("familie.konflikt_hinweis")).toBeInTheDocument();
  });

  it("weist auf ein Kind über dem Höchstalter hin", () => {
    const s = souscription();
    s.kinder[0].ueber_hoechstalter = true;
    bereich(s);
    expect(screen.getByText("familie.ueber_hoechstalter")).toBeInTheDocument();
  });

  it("zeigt anonymisierte Personen ohne Namen, Karte und Bearbeitung", () => {
    const s = souscription({
      erwachsene: [
        erwachsener({
          anonymisiert: true,
          vorname: "",
          nachname: "",
          email: "",
          status: "eingeladen",
        }),
      ],
    });
    s.kinder[0] = {
      ...s.kinder[0],
      anonymisiert: true,
      vorname: "",
      nachname: "",
      kartennummer: "",
    };
    bereich(s);
    expect(screen.getAllByText("familie.anonymisiert")).toHaveLength(2);
    expect(screen.queryByLabelText("familie.entfernen_aria")).not.toBeInTheDocument();
    expect(screen.queryByText("familie.korrigieren")).not.toBeInTheDocument();
    expect(screen.queryByText("familie.erneut_senden")).not.toBeInTheDocument();
  });

  it("entfernt ein Kind erst nach Bestätigung", () => {
    bereich(souscription());
    fireEvent.click(screen.getByLabelText("familie.entfernen_aria"));
    expect(loeschen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("action.confirmer"));
    expect(loeschen.mock.calls[0][0]).toEqual({ souscriptionId: "s1", kindId: "k1" });
  });
});

describe("FamilienpaketeBuero", () => {
  const zuweisen = vi.fn();

  function uebersicht() {
    vi.mocked(useAdhesionsHooks.useFamilienpakete).mockReturnValue({
      data: {
        zusammenfassung: {
          pakete_bezahlt: 1,
          erwachsene_angenommen: 0,
          erwachsene_offen: 1,
          erwachsene_konflikt: 0,
          kinder_eingetragen: 1,
          listenpreis_gesamt: "120.00",
          gezahlt_gesamt: "108.00",
          familienrabatt_gesamt: "12.00",
        },
        pakete: [
          {
            id: "s1",
            hauptperson: "Anna Muster",
            numero_membre: "CA-2026-001",
            angebot: "Familie",
            hauptperson_angebot: "CID-PLUS",
            campagne: "Test 2026",
            statut: "payee",
            gesamtpreis: "108.00",
            listenpreis: "120.00",
            rabatt_pct: "10.00",
            haupt_preis_liste: "50.00",
            haupt_preis_anteil: "45.00",
            erwachsene: [
              {
                id: "e1",
                name: "Nora Muster",
                email: "nora@example.de",
                beziehung: "ehepartner",
                status: "eingeladen",
                angebot: "CID-PLUS",
                angebot_id: "o2",
                preis_liste: "50.00",
                preis_anteil: "45.00",
                anonymisiert: false,
              },
            ],
            kinder: [
              {
                id: "k1",
                name: "Lina Muster",
                alter: 8,
                anonymisiert: false,
                ueber_hoechstalter: false,
                beziehung: "kind",
                angebot: "CID-JUNIOR",
                angebot_id: "o3",
                preis_liste: "10.00",
                preis_anteil: "9.00",
              },
            ],
          },
        ],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useFamilienpakete>);
    vi.mocked(useAdhesionsHooks.usePersonAngebot).mockReturnValue({
      mutate: zuweisen,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.usePersonAngebot>);
  }

  beforeEach(() => {
    zuweisen.mockReset();
    uebersicht();
    vi.mocked(useAdhesionsHooks.useFamilienbericht).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useFamilienbericht>);
  });

  it("listet Pakete mit Personen, Status und Familienrabatt", () => {
    renderWithProviders(<FamilienpaketeBuero campagnen={[KAMPAGNE]} />);
    expect(screen.getByText("familie_buero.titel")).toBeInTheDocument();
    expect(screen.getByText(/Anna Muster/)).toBeInTheDocument();
    expect(screen.getByText(/Nora Muster/)).toBeInTheDocument();
    expect(screen.getByText(/Lina Muster/)).toBeInTheDocument();
    expect(screen.getByText("familie.status_eingeladen")).toBeInTheDocument();
    expect(screen.getByText("nora@example.de")).toBeInTheDocument();
  });

  it("zeigt anonymisierte Personen ohne Namen und E-Mail", () => {
    const q = vi.mocked(useAdhesionsHooks.useFamilienpakete)();
    const p = q.data!.pakete[0];
    p.erwachsene[0] = { ...p.erwachsene[0], anonymisiert: true, name: " ", email: "" };
    p.kinder[0] = { ...p.kinder[0], anonymisiert: true, name: " " };
    renderWithProviders(<FamilienpaketeBuero campagnen={[KAMPAGNE]} />);
    expect(screen.getAllByText(/familie_buero.anonymisiert/)).toHaveLength(2);
    expect(screen.queryByText("nora@example.de")).not.toBeInTheDocument();
  });

  it("ohne Schreibrecht gibt es keine Angebotsauswahl", () => {
    renderWithProviders(<FamilienpaketeBuero campagnen={[KAMPAGNE]} />);
    expect(screen.queryByRole("combobox", { name: /Lina Muster/ })).not.toBeInTheDocument();
  });

  it("mit Schreibrecht weist das Büro einer Person ein anderes Angebot zu", () => {
    renderWithProviders(<FamilienpaketeBuero campagnen={[KAMPAGNE]} modifiable />);
    expect(screen.getAllByLabelText("familie_buero.angebot_zuweisen").length).toBeGreaterThan(0);
  });
});

describe("FamilienBericht", () => {
  it("zeigt Zahlen je Kampagne und bietet den CSV-Export an", () => {
    vi.mocked(useAdhesionsHooks.useFamilienbericht).mockReturnValue({
      data: [
        {
          campagne_id: "c1",
          campagne: "Test 2026",
          jahr: 2026,
          pakete: 3,
          erwachsene_angenommen: 2,
          erwachsene_offen: 1,
          erwachsene_abgelehnt: 0,
          erwachsene_konflikt: 0,
          kinder: 5,
          kinder_anonymisiert: 0,
          kinder_ueber_hoechstalter: 1,
          altersgruppen: { "0-5": 1, "6-11": 3, "12-17": 1, "18+": 0 },
          listenpreis: "360.00",
          gezahlt: "324.00",
          rabatt: "36.00",
          rabatt_pct: "10.00",
        },
      ],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useFamilienbericht>);
    renderWithProviders(<FamilienBericht />);
    expect(screen.getByText("Test 2026")).toBeInTheDocument();
    expect(screen.getByText("0-5: 1 · 6-11: 3 · 12-17: 1 · 18+: 0")).toBeInTheDocument();
    expect(screen.getByText("324,00 €")).toBeInTheDocument();
    expect(screen.getByText("familie_bericht.ueber_hoechstalter")).toBeInTheDocument();
    expect(screen.getByText("familie_bericht.export")).toBeEnabled();
  });

  it("zeigt einen leeren Zustand und sperrt den Export", () => {
    vi.mocked(useAdhesionsHooks.useFamilienbericht).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useFamilienbericht>);
    renderWithProviders(<FamilienBericht />);
    expect(screen.getByText("familie_bericht.leer")).toBeInTheDocument();
    expect(screen.getByText("familie_bericht.export")).toBeDisabled();
  });
});
