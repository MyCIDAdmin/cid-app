/** Zentrale Einstellungen (apps.zentral) — Werte, die der App-Administrator ohne Release ändert. */
export interface ZentraleEinstellungen {
  warenkorb_reservierung_minuten: number;
  warenkorb_max_erneuerungen: number;
  event_zahlungsfrist_tage: number;
  hinweis_tage_vorher: number;
  hinweis_plaetze_absolut: number;
  hinweis_plaetze_prozent: number;
  hinweis_lager_menge: number;
  hinweis_max_anzahl: number;
  modifie_par: string | null;
  updated_at: string;
}

export type ZentraleEinstellungenEingabe = Partial<
  Omit<ZentraleEinstellungen, "modifie_par" | "updated_at">
>;

/** Automatischer Hinweis im Modul „Übersicht“ (GET /zentral/hinweise/). Der Server liefert nur
 * Fakten, die Sätze entstehen im Frontend (DE/FR). */
export type HinweisArt = "evenement" | "veranstaltung" | "projekt" | "artikel";
export type HinweisGrund = "plaetze" | "termin" | "frist" | "bestand";

export interface Hinweis {
  id: string;
  art: HinweisArt;
  titel: string;
  link: string;
  gruende: HinweisGrund[];
  plaetze_frei: number | null;
  plaetze_gesamt: number | null;
  /** Tage bis Termin bzw. Frist (0 = heute). */
  tage: number | null;
  /** Verfügbare Stückzahl (nur Artikel). */
  bestand: number | null;
}

export interface HinweiseAntwort {
  results: Hinweis[];
}
