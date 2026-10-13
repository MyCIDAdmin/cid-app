import type { Uebersetzungen } from "../utils/uebersetzung";

export type Kategorie =
  | "sitzung"
  | "veranstaltung"
  | "frist"
  | "projekt"
  | "spieltag"
  | "abwesenheit"
  | "dienst"
  | "vereinsdatum"
  | "sonstiges";
export const KATEGORIEN: Kategorie[] = [
  "sitzung",
  "veranstaltung",
  "frist",
  "projekt",
  "spieltag",
  "abwesenheit",
  "dienst",
  "vereinsdatum",
  "sonstiges",
];

export type Sichtbarkeit = "kreis" | "aufgabentraeger" | "mitglieder" | "oeffentlich";
export const SICHTBARKEITEN: Sichtbarkeit[] = [
  "kreis",
  "aufgabentraeger",
  "mitglieder",
  "oeffentlich",
];
export type Kreis = "bureau" | "projekt" | "event_team" | "privat" | "";
export type Wiederholung = "keine" | "woechentlich" | "zweiwoechentlich" | "monatlich";
export type TerminStatus = "vorgeschlagen" | "freigegeben" | "abgelehnt";
export type Antwort = "ausstehend" | "zusage" | "vielleicht" | "absage";
export type Ansicht = "verein" | "buero" | "meine";
export type Quelle =
  "termin" | "event" | "aufgabe" | "spieltag" | "umfrage" | "abstimmung" | "dienst";

/** Ein Eintrag der Kalenderansicht (ein Vorkommen eines Termins oder ein Feed-Eintrag). */
export interface KalenderEintrag {
  id: string;
  quelle: Quelle;
  termin_id?: string;
  /** Id des Quellobjekts bei Einträgen aus anderen Modulen (z. B. der Veranstaltung). */
  objekt_id?: string;
  titel: string;
  beschreibung: string;
  ort: string;
  link: string;
  kategorie: Kategorie;
  beginn: string;
  ende: string | null;
  ganztaegig: boolean;
  sichtbarkeit: Sichtbarkeit | "meine";
  kreis?: Kreis;
  projekt_titel?: string;
  wichtig: boolean;
  wiederholung: Wiederholung;
  status?: TerminStatus;
  meine_antwort?: Antwort | null;
  editierbar?: boolean;
  uebersetzungen?: Uebersetzungen;
}

export interface Einladung {
  user: string;
  name: string;
  antwort: Antwort;
}

export interface Termin {
  id: string;
  titel: string;
  beschreibung: string;
  ort: string;
  link: string;
  kategorie: Kategorie;
  beginn: string;
  ende: string | null;
  ganztaegig: boolean;
  sichtbarkeit: Sichtbarkeit;
  kreis: Kreis;
  projekt: string | null;
  projekt_titel: string;
  evenement: string | null;
  evenement_titel: string;
  wichtig: boolean;
  wiederholung: Wiederholung;
  wiederholung_bis: string | null;
  erinnerung_stunden: number | null;
  status: TerminStatus;
  publikation: string | null;
  einladungen: Einladung[];
  meine_antwort: Antwort | null;
  uebersetzungen?: Uebersetzungen;
}

export interface TerminPayload {
  titel: string;
  beschreibung: string;
  ort: string;
  link: string;
  kategorie: Kategorie;
  beginn: string;
  ende: string | null;
  ganztaegig: boolean;
  sichtbarkeit: Sichtbarkeit;
  kreis: Kreis;
  projekt: string | null;
  evenement: string | null;
  wichtig: boolean;
  wiederholung: Wiederholung;
  wiederholung_bis: string | null;
  erinnerung_stunden: number | null;
  einladen?: string[];
}

export interface KalenderZugang {
  verein: boolean;
  buero: boolean;
  schreiben: boolean;
  vorschlagen: boolean;
  verwaltung: boolean;
}

export interface Person {
  user: string;
  name: string;
}

/** Helfer-Slot an einem Termin oder einer Veranstaltung (Release 16). */
export interface Dienst {
  id: string;
  termin: string | null;
  termin_titel: string;
  evenement: string | null;
  evenement_titel: string;
  titel: string;
  beschreibung: string;
  beginn: string;
  ende: string | null;
  benoetigt: number;
  faehigkeit: string | null;
  faehigkeit_name: string;
  austragen_bis: string | null;
  erinnerung_stunden: number | null;
  besetzt: number;
  frei: number;
  ich_eingetragen: boolean;
  /** Namen nur für Schreibberechtigte. */
  eingetragen: Person[];
}

export interface DienstPayload {
  termin?: string | null;
  evenement?: string | null;
  titel: string;
  beschreibung: string;
  beginn: string;
  ende: string | null;
  benoetigt: number;
  faehigkeit: string | null;
  austragen_bis: string | null;
  erinnerung_stunden: number | null;
}

export interface DienstVorschlag extends Person {
  kommentar: string;
}
