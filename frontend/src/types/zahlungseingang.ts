/**
 * Importierte Zahlungseingänge (Release 3, 2026-10-12 — apps.cotisations.Zahlungseingang).
 * Vollständige Zeilen (Mitglied + Artikel) werden beim Import direkt als bezahlte Cotisation
 * gebucht; unvollständige bleiben „offen" und werden in der Verwaltung ergänzt/zugeordnet.
 */
import type { ModePaiement, TypeArticle } from "./cotisation";

export type StatusZahlungseingang = "offen" | "gebucht" | "verworfen";

/** Artikel, die ein Zahlungseingang annehmen kann (apps.cotisations ARTIKEL_ERLAUBT). */
export type ZahlungsArtikel = Extract<
  TypeArticle,
  "cotisation" | "adhesion" | "don" | "autre_libre"
>;

export interface ZahlungseingangMitglied {
  id: string;
  numero_membre: string;
  prenom: string;
  nom: string;
  email: string;
}

export interface Zahlungseingang {
  id: number;
  datum: string | null;
  betrag: string;
  mode_paiement: ModePaiement | "";
  referenz: string;
  verwendungszweck: string;
  membre: string | null;
  membre_info: ZahlungseingangMitglied | null;
  type_article: ZahlungsArtikel | "";
  annee: number | null;
  libelle: string;
  status: StatusZahlungseingang;
  cotisation: string | null;
  hinweis: string;
  quelle_datei: string;
  /** Was für die Buchung noch fehlt ("Mitglied", "Artikel"); leer = buchbar. */
  fehlt: string[];
  created_at: string;
}

export interface ZahlungseingaengeFiltres {
  status?: StatusZahlungseingang | "";
  q?: string;
}

export type ZahlungseingangPatch = Partial<
  Pick<Zahlungseingang, "membre" | "type_article" | "annee" | "libelle" | "mode_paiement" | "datum">
>;

/** Verwaltbare Dropdown-Werte der Excel-Vorlage (Release 5, apps.cotisations.ImportListenWert). */
export type ImportListe = "zahlungsart" | "verwendungszweck";

export interface ImportListenWert {
  id: string;
  liste: ImportListe;
  bezeichnung: string;
  /** Nur bei Liste „zahlungsart“: zugehöriger Buchungsmodus. */
  modus: ModePaiement | "";
  aktiv: boolean;
  reihenfolge: number;
}

export type ImportListenWertPayload = Partial<Omit<ImportListenWert, "id">>;
