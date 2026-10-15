/** Typen — Support (Release 33), backend/apps/support. */

export type TicketKategorie =
  "konto" | "mitgliedschaft" | "zahlung" | "veranstaltung" | "technik" | "sonstiges";

export const TICKET_KATEGORIEN: ReadonlyArray<TicketKategorie> = [
  "konto",
  "mitgliedschaft",
  "zahlung",
  "veranstaltung",
  "technik",
  "sonstiges",
];

export type TicketStatus =
  "offen" | "in_bearbeitung" | "wartet_auf_antwort" | "geloest" | "geschlossen";

export const TICKET_STATI: ReadonlyArray<TicketStatus> = [
  "offen",
  "in_bearbeitung",
  "wartet_auf_antwort",
  "geloest",
  "geschlossen",
];

export interface FaqEintrag {
  id: number;
  frage_de: string;
  frage_fr: string;
  antwort_de: string;
  antwort_fr: string;
  kategorie: TicketKategorie;
  reihenfolge: number;
  aktiv: boolean;
}

export type FaqEingabe = Partial<Omit<FaqEintrag, "id">>;

export interface Bearbeiter {
  id: string;
  name: string;
}

export interface Ticket {
  id: number;
  betreff: string;
  kategorie: TicketKategorie;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
  geschlossen_am: string | null;
  anzahl_nachrichten?: number;
  /** Nur für das Büro. */
  name?: string;
  art?: "mitglied" | "fan" | "konto" | "";
  bearbeiter?: Bearbeiter | null;
}

export interface TicketNachricht {
  id: number;
  von_support: boolean;
  intern: boolean;
  autor: string;
  text: string;
  created_at: string;
}

export interface TicketDetail extends Ticket {
  nachrichten: TicketNachricht[];
  kann_antworten: boolean;
}

export interface TicketEingabe {
  betreff: string;
  kategorie: TicketKategorie;
  text: string;
}

export interface TicketAenderung {
  status?: TicketStatus;
  bearbeiter?: string | null;
}

export interface NachrichtEingabe {
  text: string;
  intern?: boolean;
  status?: TicketStatus;
}

export interface TicketFilter {
  status: "aktiv" | "alle" | TicketStatus;
  q: string;
}
