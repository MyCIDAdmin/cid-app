/** Typen — Regionen (Release 26), backend/apps/regionen. */

export interface Standort {
  id: string;
  name: string;
  land: string;
  aktiv: boolean;
}

export interface Verantwortlicher {
  id: string;
  name: string;
  funktion: string;
  standort: { id: string; name: string } | null;
  vorstellung: string;
  foto_url: string | null;
  kontakt_email: string;
  eigene: boolean;
}

export interface Region {
  id: string;
  slug: string;
  name: string;
  farbe: string;
  banner_url: string | null;
  beschreibung: { de: string; fr: string };
  mitglieder: number;
  verantwortliche: Verantwortlicher[];
  meine_region: boolean;
  naechste_veranstaltung: NaechsteVeranstaltung | null;
}

export interface NaechsteVeranstaltung {
  id: string;
  titel: string;
  datum: string;
  uhrzeit: string | null;
  ort: string;
}

export interface RegionDetail extends Region {
  standorte: Standort[];
  laender: { code: string; name: string }[];
  darf_bearbeiten: boolean;
  darf_personen_verwalten: boolean;
  wettbewerb: PlatzInWettbewerb | null;
}

export interface PlatzInWettbewerb {
  saison: string;
  rang: number;
  punkte: number;
  regionen: number;
}

export interface RegionenListe {
  ergebnisse: Region[];
  ohne_region: boolean;
  darf_freigeben: boolean;
  darf_berichte: boolean;
}

export interface Person {
  id: string;
  name: string;
  email: string;
}

export interface KarteDaten {
  name?: string;
  funktion?: string;
  vorstellung?: string;
  kontakt_email?: string;
  standort?: string | null;
}

export interface VerwaltungRegion {
  id: string;
  slug: string;
  name: string;
  farbe: string;
  reihenfolge: number;
  aktiv: boolean;
  mitglieder: number;
  verantwortliche: number;
  laender: string[];
  standorte: Standort[];
}

export interface Verwaltung {
  ergebnisse: VerwaltungRegion[];
  laender: { code: string; name: string }[];
  ohne_region: string[];
}

export interface RegionAenderung {
  name?: string;
  farbe?: string;
  reihenfolge?: number;
  aktiv?: boolean;
}

// --- Beiträge und Reaktionen (Release 27) ---------------------------------------------------

export type ReaktionsArt = "daumen" | "herz" | "feier" | "applaus" | "staunen";

export interface ReaktionsStand {
  art: ReaktionsArt;
  anzahl: number;
  meine: boolean;
}

export interface Beitrag {
  id: string;
  titel: string;
  text: string;
  bild_url: string | null;
  autor_name: string;
  created_at: string;
  ausgeblendet: boolean;
  ausgeblendet_grund: string;
  reaktionen: ReaktionsStand[];
  darf_bearbeiten: boolean;
  darf_ausblenden: boolean;
}

export interface BeitraegeListe {
  gesamt: number;
  ergebnisse: Beitrag[];
}

// --- Regionale Veranstaltungen (Release 28) -------------------------------------------------

export type VeranstaltungStatus =
  "entwurf" | "eingereicht" | "veroeffentlicht" | "zurueckgewiesen" | "abgeschlossen" | "abgesagt";

export type VeranstaltungAktion =
  "einreichen" | "freigeben" | "zurueckweisen" | "absagen" | "abschliessen";

export interface Veranstaltung {
  id: string;
  region: { slug: string; name: string };
  titel: string;
  beschreibung: string;
  datum: string;
  uhrzeit: string | null;
  ort: string;
  standort: { id: string; name: string } | null;
  bild_url: string | null;
  max_teilnehmer: number | null;
  status: VeranstaltungStatus;
  ablehngrund: string;
  ersteller_name: string;
  teilnehmer_zahl: number;
  angemeldet: boolean;
  kann_anmelden: boolean;
  darf_bearbeiten: boolean;
  darf_einreichen: boolean;
  darf_freigeben: boolean;
  darf_absagen: boolean;
  darf_anwesenheit: boolean;
  darf_abschliessen: boolean;
  darf_teilnehmer_sehen: boolean;
  oeffentliche_url?: string;
  teilen?: { de: string; fr: string };
  anwesende_zahl?: number;
}

export interface VeranstaltungEingabe {
  titel: string;
  datum: string;
  ort: string;
  beschreibung?: string;
  uhrzeit?: string | null;
  max_teilnehmer?: number | null;
  standort?: string | null;
}

export interface Teilnehmer {
  user: string;
  name: string;
  anwesend: boolean;
}

/** Fan-Konto (Release 29) : Konto ohne Mitgliedschaft. */
export interface FanOptionen {
  laender: { code: string; name: string; region: { slug: string; name: string } | null }[];
  standorte: { id: string; name: string; land: string; region: string }[];
}

export interface FanProfil {
  prenom: string;
  nom: string;
  email: string;
  land_de: string;
  standort_id: string | null;
  standort: string | null;
  region: { slug: string; name: string } | null;
  mitgliedsantrag_am: string | null;
  ist_mitglied_in_erwartung: boolean;
}

export interface FanRegistrierung {
  email: string;
  password: string;
  prenom: string;
  nom: string;
  langue_preferee: "fr" | "de" | "ar";
  land_de?: string;
  standort?: string | null;
  consentement_rgpd: true;
}

export interface FanAenderung {
  prenom: string;
  nom: string;
  land_de: string;
  standort: string | null;
}

export interface MitgliedWerdenEingabe {
  date_naissance: string;
  sexe: "homme" | "femme" | "non_renseigne";
  telephone: string;
  adresse_de: string;
  code_postal_de?: string;
  ville_de: string;
}

/** Wettbewerb der Regionen (Release 30), backend/apps/regionen/wettbewerb*.py. */
export interface WettbewerbSaison {
  id: string;
  name: string;
  start: string;
  ende: string;
  preis: string;
  eingefroren: boolean;
  laufend: boolean;
}

export interface WettbewerbRegeln {
  punkte_veranstaltung: number;
  punkte_anwesend: number;
  max_anwesende: number;
  punkte_erstteilnehmer: number;
  punkte_neumitglied: number;
  max_treffen_monat: number;
}

export type AbzeichenKey = "erstes_treffen" | "zehn_treffen" | "fleissigste_region";

export interface Abzeichen {
  key: AbzeichenKey;
  anzahl: number;
}

export interface RanglisteZeile {
  rang: number;
  region: { slug: string; name: string; farbe: string };
  punkte: number;
  mitglieder: number;
  punkte_pro_mitglied: number;
  treffen: number;
  abzeichen: Abzeichen[];
}

export interface VerlaufSerie {
  slug: string;
  name: string;
  farbe: string;
  werte: number[];
}

export interface Monatssieger {
  monat: string;
  regionen: string[];
}

export interface EwigeZeile {
  region: { slug: string; name: string; farbe: string };
  punkte: number;
  saisons: number;
}

export interface Wettbewerb {
  saisons: WettbewerbSaison[];
  saison: WettbewerbSaison | null;
  regeln: WettbewerbRegeln;
  ewige_tabelle: EwigeZeile[];
  darf_verwalten: boolean;
  ist_admin: boolean;
  rangliste: RanglisteZeile[];
  verlauf: { monate: string[]; serien: VerlaufSerie[] };
  monatssieger: Monatssieger[];
}

export type PunkteGrund =
  "veranstaltung" | "anwesenheit" | "erstteilnehmer" | "neumitglied" | "korrektur";

export interface JournalEintrag {
  id: string;
  saison: string;
  region: { slug: string; name: string };
  grund: PunkteGrund;
  punkte: number;
  anzahl: number;
  veranstaltung: { id: string; titel: string } | null;
  datum: string;
  begruendung: string;
  von: string;
  erstellt_am: string;
}

export interface Journal {
  gesamt: number;
  ergebnisse: JournalEintrag[];
}

export interface KorrekturEingabe {
  region: string;
  punkte: number;
  begruendung: string;
  saison?: string;
}

export interface SaisonEingabe {
  name: string;
  start: string;
  ende: string;
  preis?: string;
}

/** Fans und Berichte (Release 31), backend/apps/regionen/berichte.py. */
export interface FanZeile {
  user: string;
  name: string;
  art: "mitglied" | "fan";
  anmeldungen: number;
  teilnahmen: number;
  reaktionen: number;
  letzte_aktivitaet: string;
}

export interface FansListe {
  gesamt: number;
  mitglieder: number;
  fans: number;
  ergebnisse: FanZeile[];
}

export interface FanDetail {
  name: string;
  art: "mitglied" | "fan";
  reaktionen: number;
  veranstaltungen: {
    id: string;
    titel: string;
    datum: string;
    angemeldet_am: string;
    anwesend: boolean;
    abgeschlossen: boolean;
  }[];
}

export interface Kennzahlen {
  treffen: number;
  geplant: number;
  abgesagt: number;
  anmeldungen: number;
  anwesende: number;
  anwesenheitsquote: number | null;
  beitraege: number;
  reaktionen: number;
  fans_gesamt: number;
  fans_mitglieder: number;
  fans_ohne_mitgliedschaft: number;
  fans_neu: number;
  fans_aktiv: number;
  fan_zu_mitglied: number;
  punkte: number;
}

export interface Bericht {
  von: string;
  bis: string;
  regionen: (Kennzahlen & { slug: string; name: string })[];
  gesamt: Kennzahlen;
}
