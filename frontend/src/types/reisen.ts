/** Typen des Moduls „Reisen & Fahrgemeinschaften“ (Backend: apps.reisen). */

export type Sichtbarkeit = "eingeladen" | "mitglieder" | "konto";
export type Beitritt = "offen" | "genehmigung" | "einladung";
export type Phase = "interesse" | "planung" | "buchung" | "reise" | "rueckblick";
export type TeilnehmerStatus =
  "eingeladen" | "angefragt" | "interessiert" | "dabei" | "warteliste" | "abgelehnt" | "abgesagt";
export type Rolle = "organisator" | "vertreter" | "teilnehmer";
export type Freigabe = "privat" | "teilgruppe" | "alle";
export type Baustein = "flug" | "transport" | "unterkunft" | "tickets" | "programm" | "sonstiges";
export type EntscheidungTyp = "auswahl" | "empfehlung" | "termin" | "stimmung";
export type Wert = "ja" | "vielleicht" | "nein";

export interface ReiseListItem {
  id: string;
  titel: string;
  ziel_ort: string;
  land: string;
  start: string | null;
  ende: string | null;
  phase: Phase;
  abgesagt: boolean;
  sichtbarkeit: Sichtbarkeit;
  beitritt: Beitritt;
  rencontre: string | null;
  dabei: number;
  interessiert: number;
  warteliste: number;
  min_teilnehmer: number | null;
  max_teilnehmer: number | null;
  findet_statt: boolean | null;
  mein_status: TeilnehmerStatus | null;
  meine_rolle: Rolle | null;
}

export interface Option {
  id: string;
  titel: string;
  beschreibung: string;
  link: string;
  preis: string | null;
  preis_einheit: string;
  entfernung: string;
  von_datum: string | null;
  bis_datum: string | null;
  ist_selbst: boolean;
  ueber_budget: boolean;
  stimmen: Record<Wert, number>;
  waehler: Record<Wert, string[]> | null;
  meine: Wert | null;
  kann_loeschen: boolean;
}

export interface Beschluss {
  option: string | null;
  titel: string | null;
  von_datum: string | null;
  bis_datum: string | null;
  link: string;
  preis: string | null;
  preis_einheit: string;
  entfernung: string;
  begruendung: string;
  am: string | null;
  folgen: number;
}

export interface Entscheidung {
  id: string;
  typ: EntscheidungTyp;
  baustein: Baustein;
  titel: string;
  beschreibung: string;
  mehrfach: boolean;
  frist: string | null;
  status: "offen" | "geschlossen" | "beschlossen";
  optionen: Option[];
  beschluss: Beschluss | null;
  vorschlag: string | null;
  teilgenommen: number;
  ich_habe_abgestimmt: boolean;
  teilgruppe: string | null;
  teilgruppe_name: string | null;
}

export interface Etappe {
  id: string;
  richtung: "hin" | "rueck" | "zwischen";
  art: "flug" | "zug" | "bus" | "auto" | "sonstiges";
  von_ort: string;
  von_code: string;
  nach_ort: string;
  nach_code: string;
  abfahrt: string | null;
  ankunft: string | null;
  anbieter: string;
  status: "offen" | "geplant" | "gebucht" | "selbst";
  referenz?: string;
}

export interface EtappeGrob {
  id: string;
  richtung: string;
  nach_ort: string;
  tag: string | null;
  gebucht: boolean;
}

export interface MeineAngaben {
  id: string;
  status: TeilnehmerStatus;
  rolle: Rolle;
  begleitpersonen: number;
  freigabe_hin: Freigabe;
  freigabe_rueck: Freigabe;
  freigabe_unterkunft: Freigabe;
  verbergen_vor_orga: boolean;
  unterkunft: string | null;
  unterkunft_eigen: string;
  unterkunft_gebucht: boolean;
  stadionkarte: boolean;
  dokument_gueltig: boolean;
  regeln_bestaetigt_am: string | null;
  notiz: string;
  geburtsdatum: string | null;
  offen_gemeinsame_anreise: boolean;
  etappen: Etappe[];
}

export interface JetztDranPunkt {
  art: string;
  id: string | null;
  titel: string;
  frist: string | null;
}

export interface Info {
  id: string;
  titel: string;
  text: string;
  wichtig: boolean;
  gueltig_bis: string | null;
  gelesen_pflicht: boolean;
  gelesen: boolean;
  erstellt: string;
  ausstehend?: string[];
  teilgruppe: string | null;
  teilgruppe_name: string | null;
}

export interface ReiseDetail extends ReiseListItem {
  beschreibung: string;
  stadion: string;
  interessen_frist: string | null;
  anmelde_frist: string | null;
  vorschau_oeffentlich: boolean;
  vorschlaege_erlaubt: boolean;
  budget_grenzen: Record<string, string>;
  kann_verwalten: boolean;
  ist_organisator: boolean;
  voll: boolean;
  chat_gruppe: string | null;
  beschlossen: Entscheidung[];
  stadion_infos?: string;
  laenderinfo?: string;
  regeln?: string;
  offene_entscheidungen?: Entscheidung[];
  infos?: Info[];
  jetzt_dran?: JetztDranPunkt[];
  neu?: { entscheidungen: number; infos: number; aufgaben: number } | null;
  regeln_bestaetigt?: boolean;
  einladungs_token?: string;
  laenderprofil?: Laenderprofil | null;
  meine?: MeineAngaben;
}

export interface Teilnehmer {
  id: string;
  user: string;
  name: string;
  rolle: Rolle;
  status: TeilnehmerStatus;
  begleitpersonen: number;
  nachricht?: string;
  etappen?: (Etappe | EtappeGrob)[];
  unterkunft?: { unterkunft?: string | null; name?: string; gebucht: boolean } | null;
  stadionkarte?: boolean;
  dokument_gueltig?: boolean;
  regeln_bestaetigt?: boolean;
  notiz?: string;
}

export interface Unterkunft {
  id: string;
  name: string;
  adresse: string;
  entfernung: string;
  link: string;
  belegt: number;
}

export interface UebersichtZeile {
  ort: string;
  tag: string | null;
  anzahl: number;
  namen: string[];
}

export interface Uebersicht {
  ankuenfte: UebersichtZeile[];
  abreisen: UebersichtZeile[];
  belegung: { unterkunft: string; anzahl: number; namen: string[] }[];
  ampel: {
    teilnehmer: number;
    hin_gebucht: number;
    rueck_gebucht: number;
    unterkunft_gebucht: number;
    stadionkarte: number;
    regeln_bestaetigt: number;
  };
}

export interface Aufgabe {
  id: string;
  titel: string;
  beschreibung: string;
  verantwortlich: string | null;
  verantwortlich_name: string | null;
  frist: string | null;
  status: "offen" | "in_arbeit" | "erledigt";
  ueberfaellig: boolean;
  teilgruppe: string | null;
  teilgruppe_name: string | null;
}

export interface Kosten {
  hinweis: string;
  posten: {
    id: string;
    bezeichnung: string;
    betrag: string;
    bezahlt_von: string;
    bezahlt_von_name: string;
    anteile: { user: string; name: string; gewicht: string }[];
    kann_loeschen: boolean;
  }[];
  salden: { user: string; name: string; cents: number }[];
  ueberweisungen: { von: string; an: string; cents: number }[];
}

export interface ReiseOeffentlich {
  id: string;
  titel: string;
  ziel_ort: string;
  land: string;
  start: string | null;
  ende: string | null;
  beschreibung: string;
  interessiert: number;
}

export interface StadionVorschlag {
  gegner: string;
  stadion?: string;
  stadt?: string;
  land?: string;
}

export interface ReiseEingabe {
  titel?: string;
  beschreibung?: string;
  ziel_ort?: string;
  land?: string;
  stadion?: string;
  start?: string | null;
  ende?: string | null;
  sichtbarkeit?: Sichtbarkeit;
  beitritt?: Beitritt;
  min_teilnehmer?: number | null;
  max_teilnehmer?: number | null;
  interessen_frist?: string | null;
  anmelde_frist?: string | null;
  vorschau_oeffentlich?: boolean;
  vorschlaege_erlaubt?: boolean;
  budget_grenzen?: Record<string, string>;
  stadion_infos?: string;
  laenderinfo?: string;
  regeln?: string;
  phase?: Phase;
  abgesagt?: boolean;
  rencontre?: string;
  vorlage?: string;
}

export interface Teilgruppe {
  id: string;
  name: string;
  anzahl: number;
  ich_bin_mitglied: boolean;
  mitglieder?: { id: string; user: string; name: string }[];
}

export interface TeilgruppenVorschlag {
  art: "abflug" | "unterkunft";
  name: string;
  teilnehmer: string[];
  namen: string[];
}

export interface TeilgruppenListe {
  gruppen: Teilgruppe[];
  vorschlaege?: TeilgruppenVorschlag[];
}

export interface AnkunftGruppe {
  typ: "ankunft" | "abfahrt";
  ort: string;
  tag: string;
  von: string;
  bis: string;
  weitere: number;
  ich_zugestimmt: boolean;
  kontakte: string[];
}

export interface GemeinsameAnkunft {
  offen: boolean;
  gruppen: AnkunftGruppe[];
}

export interface ChecklistePunkt {
  id: string;
  titel: string;
  frist: string | null;
  persoenlich: boolean;
  teilgruppe: string | null;
  teilgruppe_name: string | null;
  erledigt: boolean;
  ueberfaellig: boolean;
  kann_aendern: boolean;
  erledigt_zahl?: number;
  gesamt?: number;
}

export interface SaisonSpiel {
  rencontre: string;
  gegner: string;
  competition: string;
  datum: string;
  reisen: ReiseListItem[];
}

export interface Laenderprofil {
  id: string;
  land: string;
  einreise: string;
  waehrung: string;
  zeitverschiebung: string;
  steckdose: string;
  amtliche_hinweise: string;
  weitere_infos: string;
  stand: string;
}

export type LaenderprofilEingabe = Partial<Omit<Laenderprofil, "id">>;

export type WetterArt =
  "sonne" | "teilweise" | "wolken" | "nebel" | "regen" | "schnee" | "gewitter";

export interface WetterTag {
  datum: string;
  code: number | null;
  max: number | null;
  min: number | null;
}

export interface Umfeld {
  verfuegbar: boolean;
  ort?: string;
  land?: string;
  zeitzone?: string | null;
  wetter?: {
    jetzt: { temp: number; code: number | null; tag: boolean } | null;
    tage: WetterTag[];
    vorhersage_ab: string | null;
  } | null;
  kurs?: { code: string; kurs: number; stand: string } | null;
  sicherheit?: string;
}
