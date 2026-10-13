import type { StatutMembre } from "./membre";

/** Fähigkeiten-Datenbank (Release 9). Kategorien synchron zu apps.membres.models.FaehigkeitKategorie. */
export const FAEHIGKEIT_KATEGORIEN = [
  "it_web",
  "medien",
  "organisation",
  "finanzen_recht",
  "sprachen",
  "sport_events",
  "handwerk_technik",
  "soziales",
  "weitere",
] as const;
export type FaehigkeitKategorie = (typeof FAEHIGKEIT_KATEGORIEN)[number];

export interface Faehigkeit {
  id: string;
  bezeichnung: string;
  kategorie: FaehigkeitKategorie;
  ist_standard: boolean;
}

export interface MeineFaehigkeit {
  faehigkeit: string;
  kommentar: string;
}

export interface FaehigkeitBerichtMitglied {
  id: string;
  nom_complet: string;
  numero_membre: string;
  email: string;
  ville: string;
  statut: StatutMembre;
  kommentar: string;
}

export interface FaehigkeitBerichtZeile extends Faehigkeit {
  anzahl: number;
  mitglieder: FaehigkeitBerichtMitglied[];
}

export interface FaehigkeitenBericht {
  summen: { faehigkeiten: number; mitglieder: number; zuordnungen: number };
  ergebnisse: FaehigkeitBerichtZeile[];
}

export interface FaehigkeitenFilter {
  q: string;
  kategorie: string;
  faehigkeit: string;
  statut: string;
  alle: boolean;
}
