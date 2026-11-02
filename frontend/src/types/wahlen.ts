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
  freigaben: Partial<Record<"oeffnen" | "schliessen", Array<string | number>>>;
  ids_zugelassen: string[];
}

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
  art: "oeffnen" | "schliessen";
  freigaben: number;
  noetig: number;
  ausgefuehrt: boolean;
  wahl: Wahl;
}
