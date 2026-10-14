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
}

export interface RegionDetail extends Region {
  standorte: Standort[];
  laender: { code: string; name: string }[];
  darf_bearbeiten: boolean;
  darf_personen_verwalten: boolean;
}

export interface RegionenListe {
  ergebnisse: Region[];
  ohne_region: boolean;
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
