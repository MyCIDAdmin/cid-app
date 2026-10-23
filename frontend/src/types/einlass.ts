/** Einlass am Eingang (Backend: apps.eintritt, einlass_views). */
export type EinlassTyp = "veranstaltung" | "treffen";

export type EinlassStatus = "offen" | "teilweise" | "vollstaendig";

export interface TicketStand {
  ticket: string;
  name: string;
  gebucht_erwachsene: number;
  gebucht_kinder: number;
  drin_erwachsene: number;
  drin_kinder: number;
  offen_erwachsene: number;
  offen_kinder: number;
  status: EinlassStatus;
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
  personen: TicketStand[];
  darf_helfer_verwalten: boolean;
}

export type PruefErgebnis = {
  ergebnis:
    "gueltig" | "teilweise" | "vollstaendig" | "ungueltig" | "unbekannt" | "anderes_ereignis";
  ticket?: TicketStand;
};

export interface EinlassZiel {
  typ: EinlassTyp;
  id: string;
  titel: string;
  datum: string;
  datum_bis: string;
  uhrzeit: string | null;
  ort: string;
  rolle: "verantwortlich" | "helfer";
  heute: boolean;
}

export interface EinlassHelfer {
  id: string;
  name: string;
  email: string;
}

export interface EinlassBuchung {
  ticket: string;
  erwachsene: number;
  kinder: number;
}

export interface EinlassAntwort {
  stand: TicketStand;
  einlass: string | null;
}
