/** Types — Business Partner & Lieferanten (apps.partenaires). */

export type PartnerTyp = "partner" | "lieferant" | "beides";
export type PartnerStatus = "aktiv" | "inaktiv" | "archiviert";
export type VerknuepfungRolle =
  "lieferant" | "sponsor" | "kooperation" | "location" | "dienstleister" | "sonstige";
export type ZielTyp = "projet" | "evenement" | "produit";

export interface PartnerKategorie {
  id: string;
  nom: string;
  nom_fr: string;
  actif: boolean;
  anzahl?: number;
}

export interface Partner {
  id: string;
  nom: string;
  typ: PartnerTyp;
  statut: PartnerStatus;
  bevorzugt: boolean;
  kategorien: string[];
  kategorien_namen: string[];
  ansprechpartner: string;
  email: string;
  telefon: string;
  website: string;
  adresse: string;
  code_postal: string;
  ville: string;
  pays: string;
  ust_id: string;
  zahlungsziel_tage: number | null;
  notizen: string;
  bewertung_schnitt: number | null;
  bewertung_anzahl: number;
  verknuepfungen_anzahl: number;
  created_at: string;
  updated_at: string;
}

export interface PartnerVerknuepfung {
  id: string;
  ziel_typ: ZielTyp;
  ziel_id: string | null;
  ziel_label: string;
  rolle: VerknuepfungRolle;
  notiz: string;
  created_at: string;
}

export interface PartnerDetail extends Partner {
  verknuepfungen: PartnerVerknuepfung[];
}

export interface PartnerBewertung {
  id: string;
  verknuepfung: string | null;
  verknuepfung_label: string;
  qualitaet: number;
  preis_leistung: number;
  zuverlaessigkeit: number;
  kommunikation: number;
  schnitt: number;
  kommentar: string;
  bewerter_name: string;
  created_at: string;
}

export type PartnerSchreibDaten = Partial<
  Omit<
    Partner,
    | "id"
    | "statut"
    | "kategorien_namen"
    | "bewertung_schnitt"
    | "bewertung_anzahl"
    | "verknuepfungen_anzahl"
    | "created_at"
    | "updated_at"
  >
>;

export interface PartnerFiltre {
  q?: string;
  typ?: "" | "partner" | "lieferant";
  statut?: "" | PartnerStatus;
  kategorie?: string[];
  bevorzugt?: boolean;
  min_note?: number | null;
  ordering?: "nom" | "-nom" | "note" | "-created_at";
  projet?: string;
  evenement?: string;
  produit?: string;
}

export interface BewertungDaten {
  qualitaet: number;
  preis_leistung: number;
  zuverlaessigkeit: number;
  kommunikation: number;
  kommentar: string;
  verknuepfung?: string | null;
}

export interface VerknuepfungDaten {
  ziel_typ: ZielTyp;
  ziel_id: string;
  rolle: VerknuepfungRolle;
  notiz?: string;
}

export interface ZielOption {
  id: string;
  label: string;
}

export const BEWERTUNG_KRITERIEN = [
  "qualitaet",
  "preis_leistung",
  "zuverlaessigkeit",
  "kommunikation",
] as const;
export type BewertungKriterium = (typeof BEWERTUNG_KRITERIEN)[number];

export const VERKNUEPFUNG_ROLLEN: VerknuepfungRolle[] = [
  "lieferant",
  "sponsor",
  "kooperation",
  "location",
  "dienstleister",
  "sonstige",
];
