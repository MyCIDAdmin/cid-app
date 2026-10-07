/** Types — Mitglieder-Reporting (apps.membres.reporting / reporting_views). Beträge sind
 * Dezimal-Strings (z. B. "150.00"). */
import type { Pays, StatutMembre } from "./membre";

export type AktivitaetTyp =
  | "mitgliedschaft"
  | "bestellung"
  | "teilnahme"
  | "beitrag"
  | "projektbeitrag"
  | "projektmitarbeit"
  | "statuswechsel";

export const AKTIVITAET_TYPEN: AktivitaetTyp[] = [
  "mitgliedschaft",
  "bestellung",
  "teilnahme",
  "beitrag",
  "projektbeitrag",
  "projektmitarbeit",
  "statuswechsel",
];
/** Arten, die in "Aktivitäten gesamt" eines Mitglieds zählen (Statuswechsel nicht). */
export const MITGLIED_AKTIVITAET_TYPEN: AktivitaetTyp[] = AKTIVITAET_TYPEN.filter(
  (t) => t !== "statuswechsel",
);

export type HistorieGrund = "paiement_confirme" | "echeance_depassee" | "manuel" | "non_renouvele";

export interface HistorieEintrag {
  annee: number;
  statut: StatutMembre;
  raison: HistorieGrund;
  date_effet: string;
}

export interface MitgliedReportingZeile {
  id: string;
  numero_membre: string;
  prenom: string;
  nom: string;
  email: string;
  pays: Pays;
  ville: string;
  statut: StatutMembre;
  date_adhesion: string;
  historie: HistorieEintrag[];
  aktivitaeten: Record<string, number>;
  aktivitaeten_gesamt: number;
  betrag_gesamt: string;
}

export interface MitgliederReporting {
  count: number;
  page: number;
  page_size: number;
  summen: { mitglieder: number; aktivitaeten: number; betrag: string };
  ergebnisse: MitgliedReportingZeile[];
}

export interface AktivitaetZeile {
  typ: AktivitaetTyp;
  id: string;
  /** ISO-Zeitstempel (lokale Zeit). */
  datum: string;
  membre_id: string;
  membre_name: string;
  numero_membre: string;
  titel: string;
  betrag: string | null;
  statut: string;
}

export interface AktivitaetenReporting {
  count: number;
  page: number;
  page_size: number;
  typen: AktivitaetTyp[];
  summen: Record<string, { anzahl: number; betrag: string }>;
  ergebnisse: AktivitaetZeile[];
}

export type ReportingAnsicht = "mitglieder" | "aktivitaeten";
export type MitgliederSortierung =
  "nom" | "aktivitaeten" | "betrag" | "date_adhesion" | "numero_membre";

export interface MembreReportingFiltre {
  q: string;
  statut: "" | StatutMembre;
  pays: string;
  land: string;
  ville: string;
  date_adhesion_apres: string;
  date_adhesion_avant: string;
  historie_statut: "" | StatutMembre;
  historie_jahr: string;
  typ: AktivitaetTyp[];
  von: string;
  bis: string;
  aktivitaet_status: string;
  min_betrag: string;
  max_betrag: string;
  min_aktivitaeten: string;
  ohne_aktivitaet: boolean;
  sortierung: MitgliederSortierung;
  /** Einzelnes Mitglied (aus der Mitgliederliste heraus gewählt). */
  membre: string;
}
