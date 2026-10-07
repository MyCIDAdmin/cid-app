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
  logo_url: string | null;
  hauptkontakt_name: string;
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
  logo_anzeigen: boolean;
  created_at: string;
}

export interface PartnerKontakt {
  id: string;
  partner: string;
  name: string;
  funktion: string;
  email: string;
  telefon: string;
  hauptkontakt: boolean;
}

export type PartnerKontaktDaten = Partial<Omit<PartnerKontakt, "id" | "partner">> & {
  name: string;
};

export type DokumentTyp = "vertrag" | "angebot" | "sonstiges";
export const DOKUMENT_TYPEN: DokumentTyp[] = ["vertrag", "angebot", "sonstiges"];

export interface PartnerDokument {
  id: string;
  partner: string;
  typ: DokumentTyp;
  titel: string;
  datei_url: string | null;
  gueltig_bis: string | null;
  notiz: string;
  hochgeladen_von_name: string;
  created_at: string;
}

export interface DokumentDaten {
  datei: File;
  titel: string;
  typ: DokumentTyp;
  gueltig_bis?: string;
  notiz?: string;
}

export interface PartnerDetail extends Partner {
  verknuepfungen: PartnerVerknuepfung[];
  kontakte: PartnerKontakt[];
  dokumente: PartnerDokument[];
}

export type AngebotStatus = "offen" | "zuschlag" | "abgelehnt";

export interface Angebot {
  id: string;
  projet: string;
  partner: string;
  partner_name: string;
  partner_note: number | null;
  /** Dezimal-String, z. B. "480.00". */
  betrag: string;
  gueltig_bis: string | null;
  beschreibung: string;
  dokument: string | null;
  dokument_url: string | null;
  status: AngebotStatus;
  created_at: string;
}

export interface AngebotDaten {
  projet: string;
  partner: string;
  betrag: string;
  gueltig_bis?: string | null;
  beschreibung?: string;
  dokument?: string | null;
}

export interface ImportGruppe {
  name: string;
  anzahl: number;
  summe: number;
  neu: boolean;
}

export interface ImportErgebnis {
  gruppen: ImportGruppe[];
  bestaetigt: boolean;
  partner_neu?: number;
  ausgaben_verknuepft?: number;
}

/** Logo-Eintrag, den Projekt- und Veranstaltungsseiten mitliefern (`partner_logos`). */
export interface PartnerLogoEintrag {
  id: string;
  nom: string;
  logo_url: string;
  website: string;
  rolle: VerknuepfungRolle;
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
    | "logo_url"
    | "hauptkontakt_name"
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
  logo_anzeigen?: boolean;
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

/** Bei diesen Rollen ist "Logo zeigen" standardmäßig angehakt (wie im Backend). */
export const LOGO_STANDARD_ROLLEN: VerknuepfungRolle[] = ["sponsor", "kooperation"];
