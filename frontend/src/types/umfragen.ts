/** Umfragen (Release 11/12) — Spiegel von apps.umfragen. */
import type { Uebersetzbar } from "../utils/uebersetzung";

export type Zielgruppe = "mitglieder" | "konten";
export type ErgebnisModus = "admin" | "nach_frist" | "live";
export type FrageTyp = "einzel" | "mehrfach" | "freitext";

export interface UmfrageOption extends Uebersetzbar {
  id?: string;
  text: string;
  ordre?: number;
}

export interface UmfrageFrage extends Uebersetzbar {
  id?: string;
  text: string;
  /** Thema/Kategorie ; Fragen mit gleichem Thema werden gruppiert (leer = ohne Thema). */
  thema?: string;
  typ: FrageTyp;
  pflicht: boolean;
  /** Auswahlfragen: zusätzliches Freitextfeld (Kommentar) zur Antwort. */
  freitext_zusatz?: boolean;
  ordre?: number;
  optionen: UmfrageOption[];
}

export interface Umfrage extends Uebersetzbar {
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

export interface ErgebnisOption extends Uebersetzbar {
  id: string;
  text: string;
  anzahl: number;
  anteil: number;
}

export interface ErgebnisFrage extends Uebersetzbar {
  id: string;
  text: string;
  thema?: string;
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
