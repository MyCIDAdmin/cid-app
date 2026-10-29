/** Testdaten für das Reisemodul (nur in Tests verwendet). */
import type { Entscheidung, Option, ReiseDetail, ReiseListItem } from "../types/reisen";

export function listItem(o: Partial<ReiseListItem> = {}): ReiseListItem {
  return {
    id: "r1",
    titel: "Auswärts in Algier",
    ziel_ort: "Algier",
    land: "Algerien",
    start: "2027-03-10",
    ende: "2027-03-14",
    phase: "planung",
    abgesagt: false,
    sichtbarkeit: "mitglieder",
    beitritt: "offen",
    rencontre: null,
    dabei: 3,
    interessiert: 2,
    warteliste: 0,
    min_teilnehmer: null,
    max_teilnehmer: null,
    findet_statt: null,
    mein_status: null,
    meine_rolle: null,
    ...o,
  };
}

export function reise(o: Partial<ReiseDetail> = {}): ReiseDetail {
  return {
    ...listItem(),
    beschreibung: "<p>Gemeinsam zum Auswärtsspiel.</p>",
    stadion: "Stade 5 Juillet",
    interessen_frist: null,
    anmelde_frist: null,
    vorschau_oeffentlich: false,
    vorschlaege_erlaubt: true,
    budget_grenzen: {},
    kann_verwalten: false,
    ist_organisator: false,
    voll: false,
    chat_gruppe: null,
    beschlossen: [],
    ...o,
  };
}

export function option(o: Partial<Option> = {}): Option {
  return {
    id: "o1",
    titel: "Direktflug",
    beschreibung: "",
    link: "",
    preis: null,
    preis_einheit: "",
    entfernung: "",
    von_datum: null,
    bis_datum: null,
    ist_selbst: false,
    ueber_budget: false,
    stimmen: { ja: 0, vielleicht: 0, nein: 0 },
    waehler: null,
    meine: null,
    kann_loeschen: false,
    ...o,
  };
}

export function entscheidung(o: Partial<Entscheidung> = {}): Entscheidung {
  return {
    id: "e1",
    typ: "auswahl",
    baustein: "flug",
    titel: "Welcher Flug?",
    beschreibung: "",
    mehrfach: false,
    frist: null,
    status: "offen",
    optionen: [option(), option({ id: "o2", titel: "Mit Umstieg" })],
    beschluss: null,
    vorschlag: null,
    teilgenommen: 0,
    ich_habe_abgestimmt: false,
    ...o,
  };
}
