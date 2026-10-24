/** Einlass am Eingang (Backend: apps.eintritt, einlass_views). */
export type EinlassTyp = "veranstaltung" | "treffen";

export type EinlassStatus = "offen" | "teilweise" | "vollstaendig";

export interface PersonStand {
  /** Id der Anmeldung bzw. Teilnahme (nicht des Tickets). */
  person: string;
  name: string;
  gebucht_erwachsene: number;
  gebucht_kinder: number;
  drin_erwachsene: number;
  drin_kinder: number;
  offen_erwachsene: number;
  offen_kinder: number;
  status: EinlassStatus;
  /** Hat die Person ein gültiges Ticket (QR)? */
  ticket: boolean;
  /** Zeitpunkt des ersten Eintrags, sonst null. */
  anwesend_seit: string | null;
}

export interface EinlassZaehler {
  gebucht_erwachsene: number;
  gebucht_kinder: number;
  drin_erwachsene: number;
  drin_kinder: number;
}

export interface EinlassUebersicht {
  typ: EinlassTyp;
  id: string;
  titel: string;
  datum: string;
  datum_bis: string;
  ticket_aktiv: boolean;
  zaehler: EinlassZaehler;
  personen: PersonStand[];
  darf_helfer_verwalten: boolean;
  darf_exportieren: boolean;
}

export type PruefErgebnis = {
  ergebnis:
    "gueltig" | "teilweise" | "vollstaendig" | "ungueltig" | "unbekannt" | "anderes_ereignis";
  ticket?: PersonStand;
};

export interface EinlassZiel {
  typ: EinlassTyp;
  id: string;
  titel: string;
  datum: string;
  datum_bis: string;
  uhrzeit: string | null;
  ort: string;
  ticket_aktiv: boolean;
  rolle: "verantwortlich" | "helfer";
  heute: boolean;
}

export interface EinlassHelfer {
  id: string;
  name: string;
  email: string;
}

export interface EinlassBuchung {
  person: string;
  erwachsene: number;
  kinder: number;
}

export interface EinlassAntwort {
  stand: PersonStand;
  einlass: string | null;
}
