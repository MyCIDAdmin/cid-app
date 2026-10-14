import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../../api/aktivitaet";
import * as hooks from "../../hooks/useAktivitaet";
import { renderWithProviders } from "../../test/renderWithProviders";
import type {
  Auffaelligkeit,
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

function mocks() {
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
});
