import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../../api/aktivitaet";
import * as hooks from "../../hooks/useAktivitaet";
import { renderWithProviders } from "../../test/renderWithProviders";
import type {
  Auffaelligkeit,
  Bericht,
  Pflege,
  Review,
  Journal,
  JournalEintrag,
  Nutzung,
  Uebersicht,
} from "../../types/aktivitaet";
import AktivitaetTab from "./AktivitaetTab";

vi.mock("../../hooks/useAktivitaet", () => ({
  useUebersicht: vi.fn(),
  useJournal: vi.fn(),
  useAktionen: vi.fn(),
  useAuffaelligkeiten: vi.fn(),
  useAuffaelligkeitErledigen: vi.fn(),
  useNutzung: vi.fn(),
  useBerichte: vi.fn(),
  useBericht: vi.fn(),
  useBerichtErzeugen: vi.fn(),
  useBerichtSenden: vi.fn(),
  useReviews: vi.fn(),
  useReview: vi.fn(),
  useReviewAnlegen: vi.fn(),
  useKontoEntscheiden: vi.fn(),
  useReviewAbschliessen: vi.fn(),
  usePflege: vi.fn(),
  usePflegeSpeichern: vi.fn(),
  usePflegeAusfuehren: vi.fn(),
}));
vi.mock("../../api/aktivitaet", () => ({ exportJournal: vi.fn() }));
vi.mock("../../utils/telechargement", () => ({ declencherTelechargement: vi.fn() }));

const uebersicht: Uebersicht = {
  tage: 30,
  kacheln: {
    logins: 12,
    fehlversuche: 3,
    sperren: 1,
    registrierungen: 2,
    freigaben: 1,
    rollenaenderungen: 4,
    geraete_limit: 0,
    server_fehler: 2,
    auffaelligkeiten_offen: 1,
    passwort: 1,
    aktive_nutzer: 7,
    aktiv_24h: 2,
    aktiv_7d: 5,
    aktiv_30d: 7,
  },
  verlauf: [
    { tag: "2026-10-13", logins: 2, fehlversuche: 1 },
    { tag: "2026-10-14", logins: 3, fehlversuche: 0 },
  ],
  heatmap: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0)),
  top_ips: [{ ip: "1.2.3.4", anzahl: 3, zuletzt: "2026-10-14T09:00:00Z" }],
  privilegiert: [
    {
      id: "u1",
      name: "Alex Admin",
      email: "admin@example.de",
      rolle: "App Admin",
      letzte_anmeldung: null,
      totp: false,
    },
  ],
  konten: { aktiv: 40, inaktiv_90d: 5, nie_angemeldet: 2 },
};

const eintrag: JournalEintrag = {
  id: "e1",
  zeit: "2026-10-14T09:00:00Z",
  aktion: "login_failed",
  label: { de: "Anmeldung fehlgeschlagen", fr: "Échec de connexion" },
  kategorie: "anmeldung",
  gewicht: "warnung",
  user: null,
  ip: "1.2.3.4",
  geraet: "Chrome Android",
  details: { email_masked: "a***@example.de" },
};

// Die Testumgebung läuft je nach Browser-Sprache auf Deutsch oder Französisch.
const LABEL = /Anmeldung fehlgeschlagen|Échec de connexion/;

const journal: Journal = { anzahl: 1, seite: 1, seiten: 1, ergebnisse: [eintrag] };

const erledigen = vi.fn();

const auffaelligkeit: Auffaelligkeit = {
  id: "a1",
  regel: "bruteforce",
  gewicht: "warnung",
  erkannt_am: "2026-10-14T09:00:00Z",
  status: "offen",
  text: {
    de: "12 fehlgeschlagene Anmeldungen von 1.2.3.4",
    fr: "12 échecs de connexion depuis 1.2.3.4",
  },
  user: null,
  ip: "1.2.3.4",
  erledigt_von: null,
  erledigt_am: null,
};
const AUFFAELLIGKEIT_TEXT = /12 fehlgeschlagene Anmeldungen|12 échecs de connexion/;

const nutzung: Nutzung = {
  tage: 30,
  aktiv: { d1: 3, d7: 10, d30: 20, konten: 40 },
  verlauf: [
    { tag: "2026-10-13", nutzer: 4, fenster: 9 },
    { tag: "2026-10-14", nutzer: 6, fenster: 12 },
  ],
  module: [
    { modul: "membres", label: { de: "Mitglieder", fr: "Membres" }, nutzer: 8, fenster: 30 },
    { modul: "kalender", label: { de: "Kalender", fr: "Calendrier" }, nutzer: 0, fenster: 0 },
  ],
  ungenutzt: ["kalender"],
};

const bericht: Bericht = {
  jahr: 2026,
  monat: 9,
  erstellt_am: "2026-10-01T05:45:00Z",
  versendet_am: null,
  daten: {
    zeitraum: { jahr: 2026, monat: 9 },
    sicherheit: {
      logins: 120,
      fehlversuche: 4,
      sperren: 0,
      registrierungen: 3,
      freigaben: 3,
      rollenaenderungen: 1,
      passwort: 2,
    },
    aenderungen: { mitglieder: 14, zahlungen: 22 },
    betrieb: { server_fehler: 1, task_fehler: 0, mail_fehler: 0 },
    auffaelligkeiten: { neu: 2, wichtig: 0, offen: 1 },
    nutzung: { aktive: 31, module: [{ modul: "membres", nutzer: 20 }], ungenutzt: [] },
    konten: { aktiv: 40, privilegiert: 3, ohne_totp: 0, inaktiv_90d: 5, review_offen: 0 },
  },
};

const review: Review = {
  id: "r1",
  quartal: "2026-Q4",
  status: "offen",
  erstellt_am: "2026-10-01T06:00:00Z",
  abgeschlossen_am: null,
  abgeschlossen_von: null,
  anzahl: 1,
  offen: 1,
  entziehen: 0,
  positionen: [
    {
      id: "p1",
      name: "Alex Admin",
      email: "admin@example.de",
      rolle: "App Admin",
      totp: true,
      letzte_anmeldung: null,
      entscheidung: "offen",
      notiz: "",
      entschieden_von: null,
      entschieden_am: null,
      aktuell_erweitert: true,
    },
  ],
};

const pflege: Pflege = {
  automatisch: true,
  letzter_lauf: null,
  arten: [
    {
      key: "journal.anmeldung",
      gruppe: "journal",
      label: { de: "Anmeldung & Geräte", fr: "Connexion et appareils" },
      info: { de: "Protokolleinträge.", fr: "Entrées du journal." },
      frist: 180,
      standard: 180,
      minimum: 30,
      maximum: 3650,
      fest: false,
      gesamt: 50,
      betroffen: 7,
      aeltester: "2026-01-02T08:00:00Z",
    },
    {
      key: "nutzung",
      gruppe: "auswertungen",
      label: { de: "Nutzungsstatistik", fr: "Statistiques d'utilisation" },
      info: { de: "Zähler.", fr: "Compteurs." },
      frist: 400,
      standard: 400,
      minimum: 100,
      maximum: 3650,
      fest: false,
      gesamt: 10,
      betroffen: 0,
      aeltester: null,
    },
    {
      key: "sitzungen",
      gruppe: "technik",
      label: { de: "Abgelaufene Sitzungen", fr: "Sessions expirées" },
      info: { de: "Sitzungen.", fr: "Sessions." },
      frist: 0,
      standard: 0,
      minimum: 0,
      maximum: 3650,
      fest: true,
      gesamt: 0,
      betroffen: 0,
      aeltester: null,
    },
  ],
};
const ANMELDUNG = /^(Anmeldung & Geräte|Connexion et appareils)$/;
const NUTZUNGSSTATISTIK = /^(Nutzungsstatistik|Statistiques d'utilisation)$/;

const pflegeSpeichern = vi.fn();
const pflegeAusfuehren = vi.fn();
const berichtErzeugen = vi.fn();
const entscheiden = vi.fn();
const abschliessen = vi.fn();

function mutation<T>(fn: ReturnType<typeof vi.fn>) {
  return { mutate: fn, isPending: false } as unknown as T;
}

function mocks() {
  vi.mocked(hooks.usePflege).mockReturnValue({
    data: pflege,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof hooks.usePflege>);
  vi.mocked(hooks.usePflegeSpeichern).mockReturnValue(
    mutation<ReturnType<typeof hooks.usePflegeSpeichern>>(pflegeSpeichern),
  );
  vi.mocked(hooks.usePflegeAusfuehren).mockReturnValue(
    mutation<ReturnType<typeof hooks.usePflegeAusfuehren>>(pflegeAusfuehren),
  );
  vi.mocked(hooks.useBerichte).mockReturnValue({
    data: { letzter_abgeschlossener_monat: { jahr: 2026, monat: 9 }, ergebnisse: [] },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof hooks.useBerichte>);
  vi.mocked(hooks.useBericht).mockReturnValue({
    data: bericht,
    isLoading: false,
  } as unknown as ReturnType<typeof hooks.useBericht>);
  vi.mocked(hooks.useBerichtErzeugen).mockReturnValue(
    mutation<ReturnType<typeof hooks.useBerichtErzeugen>>(berichtErzeugen),
  );
  vi.mocked(hooks.useBerichtSenden).mockReturnValue(
    mutation<ReturnType<typeof hooks.useBerichtSenden>>(vi.fn()),
  );
  vi.mocked(hooks.useReviews).mockReturnValue({
    data: { aktuelles_quartal: "2026-Q4", ergebnisse: [review] },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof hooks.useReviews>);
  vi.mocked(hooks.useReview).mockReturnValue({
    data: review,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof hooks.useReview>);
  vi.mocked(hooks.useReviewAnlegen).mockReturnValue(
    mutation<ReturnType<typeof hooks.useReviewAnlegen>>(vi.fn()),
  );
  vi.mocked(hooks.useKontoEntscheiden).mockReturnValue(
    mutation<ReturnType<typeof hooks.useKontoEntscheiden>>(entscheiden),
  );
  vi.mocked(hooks.useReviewAbschliessen).mockReturnValue(
    mutation<ReturnType<typeof hooks.useReviewAbschliessen>>(abschliessen),
  );
  vi.mocked(hooks.useNutzung).mockReturnValue({
    data: nutzung,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof hooks.useNutzung>);
  vi.mocked(hooks.useAuffaelligkeiten).mockReturnValue({
    data: { offen: 1, ergebnisse: [auffaelligkeit] },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof hooks.useAuffaelligkeiten>);
  vi.mocked(hooks.useAuffaelligkeitErledigen).mockReturnValue({
    mutate: erledigen,
    isPending: false,
  } as unknown as ReturnType<typeof hooks.useAuffaelligkeitErledigen>);
  vi.mocked(hooks.useUebersicht).mockReturnValue({
    data: uebersicht,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof hooks.useUebersicht>);
  vi.mocked(hooks.useJournal).mockReturnValue({
    data: journal,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof hooks.useJournal>);
  vi.mocked(hooks.useAktionen).mockReturnValue({
    data: {
      kategorien: [
        { key: "anmeldung", label: { de: "Anmeldung", fr: "Connexion" }, aufbewahrung_tage: 180 },
      ],
      aktionen: [
        {
          aktion: "login_failed",
          label: eintrag.label,
          kategorie: "anmeldung",
          gewicht: "warnung",
        },
      ],
    },
  } as unknown as ReturnType<typeof hooks.useAktionen>);
}

describe("AktivitaetTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks();
  });

  it("zeigt die Übersicht mit Kacheln und Konten", () => {
    renderWithProviders(<AktivitaetTab />);

    expect(screen.getByLabelText("uebersicht.kacheln.fehlversuche")).toBeInTheDocument();
    expect(screen.getByText("Alex Admin")).toBeInTheDocument();
    expect(screen.getByText("uebersicht.totp_nein")).toBeInTheDocument();
    expect(screen.getByText("1.2.3.4")).toBeInTheDocument();
  });

  it("öffnet das Journal mit dem Filter der angeklickten Kachel", () => {
    renderWithProviders(<AktivitaetTab />);

    fireEvent.click(screen.getByLabelText("uebersicht.kacheln.fehlversuche"));

    expect(hooks.useJournal).toHaveBeenLastCalledWith({
      aktion: "login_failed,login_2fa_failed",
      seite: 1,
    });
    expect(screen.getByText(LABEL, { selector: "span" })).toBeInTheDocument();
  });

  it("übernimmt die IP aus der Übersicht ins Journal", () => {
    renderWithProviders(<AktivitaetTab />);

    fireEvent.click(screen.getByText("uebersicht.im_journal"));

    expect(hooks.useJournal).toHaveBeenLastCalledWith({ ip: "1.2.3.4", seite: 1 });
  });

  it("klappt Details eines Journal-Eintrags auf und exportiert", async () => {
    vi.mocked(api.exportJournal).mockResolvedValue({
      blob: new Blob(["x"]),
      nomFichier: "aktivitaet.csv",
    });
    renderWithProviders(<AktivitaetTab />);
    fireEvent.click(screen.getByText("ansicht.journal"));

    fireEvent.click(screen.getByText(LABEL, { selector: "span" }));
    expect(screen.getByText("login_failed")).toBeInTheDocument();
    expect(screen.getByText(/a\*\*\*@example\.de/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("journal.export"));
    await waitFor(() => expect(api.exportJournal).toHaveBeenCalled());
  });

  it("setzt Filter beim Ändern auf Seite 1 zurück", () => {
    renderWithProviders(<AktivitaetTab />);
    fireEvent.click(screen.getByText("ansicht.journal"));

    fireEvent.change(screen.getByLabelText("journal.ip"), { target: { value: "9.9.9.9" } });

    expect(hooks.useJournal).toHaveBeenLastCalledWith({ ip: "9.9.9.9", seite: 1 });
  });

  it("öffnet die Auffälligkeiten über die Kachel und markiert eine als erledigt", () => {
    renderWithProviders(<AktivitaetTab />);

    fireEvent.click(screen.getByLabelText("uebersicht.kacheln.auffaelligkeiten_offen"));
    expect(hooks.useAuffaelligkeiten).toHaveBeenLastCalledWith("offen");
    expect(screen.getByText(AUFFAELLIGKEIT_TEXT)).toBeInTheDocument();

    fireEvent.click(screen.getByText("auffaelligkeiten.erledigen"));
    expect(erledigen).toHaveBeenCalledWith("a1");
  });

  it("wechselt zu den erledigten Auffälligkeiten und springt mit der IP ins Journal", () => {
    renderWithProviders(<AktivitaetTab startAnsicht="auffaelligkeiten" />);

    fireEvent.click(screen.getByText("auffaelligkeiten.status.erledigt"));
    expect(hooks.useAuffaelligkeiten).toHaveBeenLastCalledWith("erledigt");

    fireEvent.click(screen.getByText("uebersicht.im_journal"));
    expect(hooks.useJournal).toHaveBeenLastCalledWith({ ip: "1.2.3.4", seite: 1 });
  });

  it("öffnet das Journal der Betriebsfehler über die Kachel", () => {
    renderWithProviders(<AktivitaetTab />);

    fireEvent.click(screen.getByLabelText("uebersicht.kacheln.server_fehler"));

    expect(hooks.useJournal).toHaveBeenLastCalledWith({ kategorie: "betrieb", seite: 1 });
  });

  it("zeigt die Nutzung je Modul und die ungenutzten Module", () => {
    renderWithProviders(<AktivitaetTab />);

    fireEvent.click(screen.getByText("ansicht.nutzung"));

    expect(hooks.useNutzung).toHaveBeenLastCalledWith(30);
    expect(screen.getByText("nutzung.kacheln.anteil")).toBeInTheDocument();
    expect(screen.getByText("50 %")).toBeInTheDocument();
    expect(screen.getByText(/Mitglieder|Membres/)).toBeInTheDocument();
    expect(screen.getByText("nutzung.ungenutzt")).toBeInTheDocument();

    fireEvent.click(screen.getAllByText("uebersicht.tage")[0]);
    expect(hooks.useNutzung).toHaveBeenLastCalledWith(7);
  });

  it("bietet den fehlenden Monatsbericht zum Erstellen an und zeigt Summen", () => {
    renderWithProviders(<AktivitaetTab startAnsicht="berichte" />);

    fireEvent.click(screen.getByText("berichte.erzeugen"));
    expect(berichtErzeugen).toHaveBeenCalledWith({ jahr: 2026, monat: 9 }, expect.anything());
  });

  it("zeigt einen Monatsbericht mit Kennzahlen", () => {
    vi.mocked(hooks.useBerichte).mockReturnValue({
      data: {
        letzter_abgeschlossener_monat: { jahr: 2026, monat: 9 },
        ergebnisse: [
          { jahr: 2026, monat: 9, erstellt_am: bericht.erstellt_am, versendet_am: null },
        ],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof hooks.useBerichte>);
    renderWithProviders(<AktivitaetTab startAnsicht="berichte" />);

    fireEvent.click(screen.getByText("09/2026"));

    expect(hooks.useBericht).toHaveBeenLastCalledWith(2026, 9);
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("berichte.felder.sicherheit.logins")).toBeInTheDocument();
  });

  it("entscheidet in der Rechteprüfung und sperrt das Abschließen solange etwas offen ist", () => {
    renderWithProviders(<AktivitaetTab startAnsicht="review" />);

    fireEvent.click(screen.getByText(/2026-Q4/));
    expect(screen.getByText("Alex Admin")).toBeInTheDocument();
    expect(screen.getByText("review.abschliessen")).toBeDisabled();

    fireEvent.click(screen.getByText("review.entscheidung.entziehen"));
    expect(entscheiden).toHaveBeenCalledWith({
      reviewId: "r1",
      positionId: "p1",
      entscheidung: "entziehen",
      notiz: "",
    });
  });

  it("schaltet die automatische Pflege um", () => {
    renderWithProviders(<AktivitaetTab startAnsicht="pflege" />);

    fireEvent.click(screen.getByLabelText(/^pflege.automatisch/));

    expect(pflegeSpeichern).toHaveBeenCalledWith({ automatisch: false });
  });

  it("speichert geänderte Fristen und lehnt Werte unter dem Minimum ab", () => {
    renderWithProviders(<AktivitaetTab startAnsicht="pflege" />);
    const eingabe = screen.getByLabelText(
      /(Nutzungsstatistik|Statistiques d.utilisation) – pflege.frist/,
    );
    const speichern = screen.getByText("pflege.speichern");
    expect(speichern).toBeDisabled();

    fireEvent.change(eingabe, { target: { value: "50" } });
    expect(speichern).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("pflege.ungueltig");

    fireEvent.change(eingabe, { target: { value: "200" } });
    expect(speichern).toBeEnabled();
    fireEvent.click(speichern);
    expect(pflegeSpeichern).toHaveBeenCalledWith({ fristen: { nutzung: 200 } }, expect.anything());
  });

  it("löscht erst nach Rückfrage und nur die gewählten Datenarten", () => {
    renderWithProviders(<AktivitaetTab startAnsicht="pflege" />);
    expect(screen.getByText("pflege.jetzt")).toBeDisabled();

    fireEvent.click(screen.getByLabelText(ANMELDUNG));
    fireEvent.click(screen.getByText("pflege.jetzt"));
    expect(pflegeAusfuehren).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toHaveTextContent("pflege.rueckfrage");

    fireEvent.click(screen.getByText("pflege.endgueltig"));
    expect(pflegeAusfuehren).toHaveBeenCalledWith(["journal.anmeldung"], expect.anything());
  });

  it("wählt alle Datenarten mit Treffern aus", () => {
    renderWithProviders(<AktivitaetTab startAnsicht="pflege" />);

    fireEvent.click(screen.getByText("pflege.mit_treffern_waehlen"));

    expect(screen.getByLabelText(ANMELDUNG)).toBeChecked();
    expect(screen.getByLabelText(NUTZUNGSSTATISTIK)).not.toBeChecked();
  });
});
