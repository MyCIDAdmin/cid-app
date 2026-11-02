/** Typen des Moduls Wahlen (API /api/v1/wahlen/, Backend apps.wahlen). */

export type Wahlform = "liste" | "person" | "mehrfach" | "ja_nein" | "rang";
export type Mehrheit = "relativ" | "absolut" | "zwei_drittel";
export type WahlStatus = "entwurf" | "aktiv" | "abgeschlossen";
export type Aufbewahrung = "30" | "90" | "365" | "manuell";
export type Sprache = "de" | "fr" | "ar";

/** 0 Ankündigung, 1 Kandidatur, 2 Prüfung, 3 Kampagne, 4 Wahl, 5 Ergebnis, 6 Übergabe. */
export const PHASEN = [
  "ankuendigung",
  "kandidatur",
  "pruefung",
  "kampagne",
  "wahl",
  "ergebnis",
  "uebergabe",
] as const;
export type PhasenName = (typeof PHASEN)[number];

export interface Termine {
  ankuendigung_am: string;
  kandidatur_von: string;
  kandidatur_bis: string;
  pruefung_bis: string;
  kampagne_bis: string;
  wahl_von: string;
  wahl_bis: string;
  einspruch_bis: string;
  uebergabe_bis: string;
}

export interface AusschussEintrag {
  membre: string;
  name: string;
  user: string | number | null;
}

export interface Wahl {
  id: string;
  titel: string;
  beschreibung: string;
  form: Wahlform;
  mehrheit: Mehrheit;
  status: WahlStatus;
  phase: number;
  phase_name: PhasenName;
  listen_groesse: number;
  posten: number;
  unterstuetzungen_noetig: number;
  zustimmungen_noetig: number;
  termine: Termine;
  aufbewahrung: Aufbewahrung;
  vote_session: string | null;
  vote_status: string | null;
  ist_ausschuss: boolean;
  kann_verwalten: boolean;
  meine_kandidatur: string | null;
  ausschuss: AusschussEintrag[];
  freigaben: Partial<Record<FreigabeArt, Array<string | number>>>;
  ids_zugelassen: string[];
  ergebnis_freigegeben: boolean;
  einspruch_ergebnis_bis: string | null;
  /** Nummer des Wahlgangs (1 = erster). */
  runde: number;
  vorgaenger: { id: string; titel: string } | null;
  /** Für Mitglieder erst sichtbar, wenn der Entwurf veröffentlicht ist. */
  folgewahl: { id: string; titel: string; status: WahlStatus } | null;
  /** Nur im Einzelabruf: darf ich abstimmen, habe ich abgestimmt? */
  teilnahme?: { wahlberechtigt: boolean; hat_gewaehlt: boolean } | null;
}

export type FreigabeArt = "oeffnen" | "schliessen" | "ergebnis";

export type WahlPayload = Pick<
  Wahl,
  "titel" | "beschreibung" | "form" | "mehrheit" | "listen_groesse" | "posten"
> &
  Termine;

export type KandidaturStatus =
  "entwurf" | "eingereicht" | "rueckfrage" | "zugelassen" | "abgelehnt" | "zurueckgezogen";

export type Amt = "pres" | "vp" | "fin" | "more" | "cand";

export interface Waehlbarkeit {
  aktiv_beitrag: boolean;
  jahre: number;
  jahre_noetig: number;
  dauer_ok: boolean;
  kein_ausschuss: boolean;
}

export interface KandidatPerson {
  id: string;
  membre: string;
  name: string;
  amt: Amt;
  foto: string | null;
  waehlbarkeit?: Waehlbarkeit;
  nachweise?: string[];
}

export type Pruefergebnis = "offen" | "ok" | "nein";

export interface Pruefpunkt {
  schluessel: string;
  automatisch: boolean;
  ergebnis: Pruefergebnis;
  notiz: string;
}

export type EntscheidungArt = "zulassen" | "rueckfrage" | "ablehnen";

export interface Entscheidung {
  id: string;
  art: EntscheidungArt;
  begruendung: string;
  artikel: string;
  vorgeschlagen_von: string | number;
  zustimmungen: Array<string | number>;
  umgesetzt_am: string | null;
  created_at: string;
}

export interface NachweisEintrag {
  id: string;
  art: string;
  person: string | null;
}

/** Öffentliche Sicht (zugelassen, veröffentlicht) ist eine Teilmenge des Dossiers. */
export interface Kandidatur {
  id: string;
  name: string;
  leitsatz: string;
  vorstellung: string;
  programm: string[];
  sprache: Sprache;
  status: KandidaturStatus;
  einspruch_bis?: string | null;
  personen: KandidatPerson[];
  wahl?: string;
  eigene?: boolean;
  einreicher?: string;
  rechte_foto?: boolean;
  bestaetigt_wahlordnung?: boolean;
  bestaetigt_fairness?: boolean;
  bestaetigt_datenschutz?: boolean;
  unterstuetzungen?: number;
  unterstuetzungen_noetig?: number;
  eingereicht_am?: string | null;
  nachbesserung_bis?: string | null;
  nachbesserungen?: number;
  begruendung?: string;
  artikel?: string;
  fehlend?: string[];
  nachweise?: NachweisEintrag[];
  pruefpunkte?: Pruefpunkt[];
  entscheidung_offen?: Entscheidung;
  entscheidungen?: Entscheidung[];
}

export interface KandidaturPayload {
  name?: string;
  leitsatz?: string;
  vorstellung?: string;
  programm?: string[];
  sprache?: Sprache;
  rechte_foto?: boolean;
  bestaetigt_wahlordnung?: boolean;
  bestaetigt_fairness?: boolean;
  bestaetigt_datenschutz?: boolean;
  personen?: Array<{ membre: string; amt: Amt }>;
}

export type BekanntmachungStatus = "entwurf" | "wartet" | "freigegeben" | "gesendet";
export type Kanal = "mail" | "app" | "print";

export interface Bekanntmachung {
  id: string;
  schluessel: "ankuendigung" | "aufruf" | "zugelassen" | "wahlbeginn" | "ergebnis";
  versand_am: string;
  kanaele: Kanal[];
  status: BekanntmachungStatus;
  gesendet_am: string | null;
  texte?: Partial<Record<Sprache, { betreff: string; html: string }>>;
  geprueft?: Partial<Record<"fr" | "ar", boolean>>;
  veraltet?: Sprache[];
  freigaben?: Array<string | number>;
  freigaben_noetig?: number;
  uebersetzung_moeglich?: boolean;
}

export interface FreigabeAntwort {
  art: FreigabeArt;
  freigaben: number;
  noetig: number;
  ausgefuehrt: boolean;
  wahl: Wahl;
}

// ---- Ergebnis, Protokoll, Einsprüche (Welle 2a)

export type Ausgang =
  | "gewaehlt"
  | "angenommen"
  | "abgelehnt"
  | "stichwahl"
  | "gleichstand"
  | "keine_stimmen"
  | "manuell";

export interface Beteiligung {
  abgegeben: number;
  berechtigt: number;
  prozent: number;
}

export interface ErgebnisOption {
  id: string;
  label: string;
  stimmen: number;
  prozent: number;
  personen: string[];
}

export interface ErgebnisInhalt {
  ausgang: Ausgang;
  gewaehlt: string[];
  stichwahl_zwischen: string[];
  beteiligung: Beteiligung;
  schwelle: number | null;
  optionen: ErgebnisOption[];
}

export type Ergebnis =
  | ({ freigegeben: true; freigegeben_am: string; weiterer_wahlgang?: boolean } & ErgebnisInhalt)
  | { freigegeben: false; beendet: boolean; beteiligung?: Beteiligung | null };

export interface Protokoll {
  titel: string;
  geoeffnet_am: string | null;
  beendet_am: string;
  ausschuss: string[];
  ergebnis: ErgebnisInhalt;
  erzeugt_am: string;
  unterschriften: Array<{ name: string; user: string | number; am: string }>;
  unterschriften_noetig: number;
  unterschriften_fehlen: number;
  einsprueche: { gesamt: number; offen: number };
}

export type EinspruchArt = "waehlbarkeit" | "ablehnung" | "ergebnis";
export type EinspruchStatus = "offen" | "stattgegeben" | "abgewiesen" | "zurueckgezogen";
export type EinspruchEntscheidung = "stattgeben" | "abweisen";

export interface Einspruch {
  id: string;
  wahl: string;
  art: EinspruchArt;
  kandidatur: string | null;
  kandidatur_name: string;
  text: string;
  status: EinspruchStatus;
  created_at: string;
  entscheiden_bis: string;
  begruendung: string;
  entschieden_am: string | null;
  // nur für Ausschuss und Büro
  einreicher?: string;
  vorschlag?: EinspruchEntscheidung | "";
  vorschlag_begruendung?: string;
  vorgeschlagen_von?: string | number | null;
  zustimmungen?: Array<string | number>;
  zustimmungen_noetig?: number;
}

export interface EinspruchPayload {
  wahl: string;
  art: EinspruchArt;
  kandidatur?: string;
  text: string;
}

// ---- Wahlbüro und Reglement (Welle 2b)

export interface BeteiligungEintrag {
  membre: string;
  name: string;
  hat_gewaehlt: boolean;
}

export interface BeteiligungListe {
  abgegeben: number;
  berechtigt: number;
  prozent: number;
  eintraege: BeteiligungEintrag[];
}

export interface Wahlzettel {
  typ: string;
  stimmen_max: number;
  schwelle: number | null;
  geoeffnet: boolean;
  optionen: Array<{ label: string; beschreibung: string; personen: string[] }>;
}

export interface UebergabePunkt {
  schluessel: string;
  automatisch: boolean;
  erledigt: boolean;
  erledigt_am: string | null;
  notiz: string;
}

export type ReglementArt =
  "wahlordnung" | "satzung" | "fairness" | "datenschutz" | "geschaeftsordnung";

export interface Reglement {
  id: string;
  schluessel: ReglementArt;
  version: string;
  gueltig_ab: string | null;
  texte: Partial<Record<Sprache, string>>;
  geprueft: Record<"fr" | "ar", boolean>;
  gelesen: boolean;
  gelesen_anzahl?: number;
  uebersetzung_moeglich?: boolean;
}

export type MitteilungsArt =
  | "kandidatur_endet"
  | "rueckfrage_frist"
  | "einspruch_listen"
  | "nichtwaehler"
  | "wahl_endet"
  | "einspruch_ergebnis";

export type MitteilungsStatus = "geplant" | "gesendet" | "uebersprungen" | "ereignis";

export type MitteilungsZielgruppe = "alle" | "kandidat" | "nichtwaehler" | "wahlberechtigte";

export interface MitteilungsZeile {
  typ: "bekanntmachung" | "erinnerung" | "ereignis";
  id: string;
  art: string;
  bezug_name: string;
  versand_am: string | null;
  zielgruppe: MitteilungsZielgruppe;
  kanaele: Array<"app" | "mail">;
  status: MitteilungsStatus;
  anzahl: number | null;
  kanaele_aenderbar: boolean;
}

export type ProbeSzenario = "zufall" | "gleichstand";

export type ProbeBereitschaftSchluessel =
  "ausschuss" | "kandidaturen" | "termine" | "bekanntmachungen" | "reglement" | "stimmberechtigte";

export interface Probewahl {
  stimmen: number;
  szenario: ProbeSzenario;
  typ: string;
  /** Es gab noch keine zugelassenen Kandidaturen: der Lauf nutzt Beispielnamen. */
  beispiel: boolean;
  ergebnis: ErgebnisInhalt;
  weiterer_wahlgang: boolean;
  bereitschaft: Array<{ schluessel: ProbeBereitschaftSchluessel; ok: boolean; anzahl?: number }>;
}
