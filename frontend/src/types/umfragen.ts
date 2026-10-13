/** Umfragen (Release 11) — Spiegel von apps.umfragen. */
export type Zielgruppe = "mitglieder" | "konten";
export type ErgebnisModus = "admin" | "nach_frist" | "live";
export type FrageTyp = "einzel" | "mehrfach" | "freitext";

export interface UmfrageOption {
  id?: string;
  text: string;
  ordre?: number;
}

export interface UmfrageFrage {
  id?: string;
  text: string;
  typ: FrageTyp;
  pflicht: boolean;
  ordre?: number;
  optionen: UmfrageOption[];
}

export interface Umfrage {
  id: string;
  titel: string;
  beschreibung: string;
  bild: string | null;
  zielgruppe: Zielgruppe;
  anonym: boolean;
  ergebnis_modus: ErgebnisModus;
  frist: string;
  veroeffentlicht: boolean;
  abgelaufen: boolean;
  fragen: UmfrageFrage[];
  teilgenommen: boolean;
  kann_ergebnisse_sehen: boolean;
  /** Nur für die Verwaltung. */
  anzahl_teilnahmen: number | null;
  angekuendigt: boolean;
  created_at: string;
}

export interface UmfragePayload {
  titel: string;
  beschreibung: string;
  zielgruppe: Zielgruppe;
  anonym: boolean;
  ergebnis_modus: ErgebnisModus;
  frist: string;
  fragen?: UmfrageFrage[];
}

export interface AntwortEingabe {
  frage: string;
  optionen?: string[];
  text?: string;
}

export interface ErgebnisOption {
  id: string;
  text: string;
  anzahl: number;
  anteil: number;
}

export interface ErgebnisFrage {
  id: string;
  text: string;
  typ: FrageTyp;
  beantwortet?: number;
  optionen?: ErgebnisOption[];
  freitexte?: string[];
}

export interface ErgebnisEinreichung {
  name: string;
  email: string;
  datum: string;
  antworten: { frage: string; werte: string[] }[];
}

export interface UmfrageErgebnisse {
  teilnehmende: number;
  anonym: boolean;
  fragen: ErgebnisFrage[];
  einreichungen?: ErgebnisEinreichung[];
}
