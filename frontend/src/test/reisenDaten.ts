/** Testdaten für das Reisemodul (nur in Tests verwendet). */
import type {
  ChecklistePunkt,
  Entscheidung,
  MeineAngaben,
  Option,
  ReiseDetail,
  ReiseListItem,
} from "../types/reisen";

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
    teilgruppe: null,
    teilgruppe_name: null,
    ...o,
  };
}

export function meineAngaben(o: Partial<MeineAngaben> = {}): MeineAngaben {
  return {
    id: "t1",
    status: "dabei",
    rolle: "teilnehmer",
    begleitpersonen: 0,
    freigabe_hin: "privat",
    freigabe_rueck: "privat",
    freigabe_unterkunft: "privat",
    verbergen_vor_orga: false,
    unterkunft: null,
    unterkunft_eigen: "",
    unterkunft_gebucht: false,
    stadionkarte: false,
    dokument_gueltig: false,
    regeln_bestaetigt_am: null,
    notiz: "",
    geburtsdatum: null,
    offen_gemeinsame_anreise: false,
    etappen: [],
    ...o,
  };
}

export function punkt(o: Partial<ChecklistePunkt> = {}): ChecklistePunkt {
  return {
    id: "c1",
    titel: "Reisepass prüfen",
    frist: null,
    persoenlich: false,
    teilgruppe: null,
    teilgruppe_name: null,
    erledigt: false,
    ueberfaellig: false,
    kann_aendern: false,
    ...o,
  };
}
