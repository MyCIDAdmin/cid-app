/** Types — module finances (Ausgaben, Budget). Miroir de apps.finances.serializers. */

import type { KategorieNamen } from "../utils/kategorie";

export type StatutDepense = "en_attente" | "approuvee" | "rejetee";

export interface CategorieDepense {
  id: string;
  nom: string;
  nom_de: string;
  nom_ar: string;
  namen?: KategorieNamen;
  /** Kennzeichnet die Kategorie „Projekte“ (Topf für die Plan-Kosten aller Projekte). */
  projektbudget?: boolean;
  actif: boolean;
  ordre: number;
}

export interface Depense {
  id: string;
  date_depense: string;
  montant: string;
  categorie: string;
  categorie_nom: string;
  categorie_namen?: KategorieNamen;
  fournisseur: string;
  partner?: string | null;
  partner_name?: string | null;
  description: string;
  evenement: string | null;
  evenement_titre: string | null;
  projet: string | null;
  projet_titre: string | null;
  aufgabe?: string | null;
  aufgabe_titel?: string | null;
  justificatif_url: string | null;
  statut: StatutDepense;
  saisie_par: string | null;
  saisie_par_nom: string;
  decide_par_nom: string;
  date_decision: string | null;
  motif_rejet: string;
  created_at: string;
}

export interface DepensePayload {
  date_depense: string;
  montant: string;
  categorie: string;
  fournisseur: string;
  partner?: string | null;
  description: string;
  evenement: string | null;
  projet: string | null;
  justificatif?: File | null;
}

export interface DepensesFiltres {
  annee?: number;
  statut?: StatutDepense;
}

export interface BudgetLigne {
  id: string;
  annee: number;
  categorie: string;
  categorie_nom: string;
  categorie_namen?: KategorieNamen;
  montant: string;
}

/** Antwort von GET /finances/budget/uebersicht/ (Beträge als Dezimal-Strings). */
export interface BudgetUebersicht {
  annee: number;
  gesamt: string;
  zugeteilt: string;
  verfuegbar: string;
  projekte: {
    kategorie: string | null;
    budget: string;
    geplant: string;
    verfuegbar: string;
  };
}

export type AktionProtokoll =
  | "erstellt"
  | "geaendert"
  | "geloescht"
  | "freigegeben"
  | "abgelehnt"
  | "budget"
  | "abgeschlossen"
  | "wiedergeoeffnet";

export interface ProtokollEintrag {
  id: string;
  zeitpunkt: string;
  benutzer_name: string;
  aktion: AktionProtokoll;
  objekt_typ: string;
  annee: number | null;
  zusammenfassung: string;
  aenderungen: Record<string, unknown>;
}

export interface Abschluss {
  annee: number;
  abgeschlossen: boolean;
  abgeschlossen_am?: string;
  abgeschlossen_durch?: string;
  snapshot?: {
    recettes: string;
    depenses: string;
    resultat: string;
    /** Begründungen je Kostenart (ID → Text), optional beim Abschluss erfasst. */
    begruendungen?: Record<string, string>;
  };
  wiedergeoeffnet_am?: string | null;
  wiedereroeffnung_grund?: string;
  offene_ausgaben?: number;
}

export interface Pruefung {
  annee: number;
  abschluss: Abschluss;
  anzahl_freigegeben: number;
  summe_freigegeben: string;
  anzahl_offen: number;
  anzahl_abgelehnt: number;
  schwelle: number;
  ohne_beleg: Depense[];
  grosse_ausgaben: Depense[];
}

export type PruefStufe = "pflicht" | "empfohlen";
export type PruefZiel = "depenses" | "pruefung" | "zahlungen" | "projekte" | "budget" | "abschluss";

export interface PruefPunkt {
  id: "freigaben" | "belege" | "beitraege" | "projekte" | "budget_gesetzt" | "budget_passt";
  stufe: PruefStufe;
  anzahl: number;
  betrag: string;
  ok: boolean;
  ziel: PruefZiel;
}

export type KostenartStatus = "ok" | "attention" | "depasse" | "aucun";

export interface ProbelaufKostenart {
  categorie_id: string;
  nom: string;
  namen?: KategorieNamen;
  montant: string;
  montant_precedent: string;
  budget: string;
  prozent: number | null;
  status: KostenartStatus;
}

export type HinweisStufe = "gut" | "achtung" | "kritisch";
export type HinweisCode =
  | "ergebnis"
  | "gesamtbudget"
  | "einnahmen_vorjahr"
  | "ueber_budget"
  | "fast_ausgeschoepft"
  | "pruefliste";

export interface Hinweis {
  code: HinweisCode;
  stufe: HinweisStufe;
  params: Record<string, unknown>;
}

export interface Probelauf {
  annee: number;
  abgeschlossen: boolean;
  schwelle_attention: number;
  annahmen: { offene_ausgaben: boolean; offene_beitraege: boolean };
  pruefliste: PruefPunkt[];
  einnahmen: {
    total: string;
    total_vorjahr: string;
    lignes: { cle: string; montant: string; montant_precedent: string }[];
  };
  ausgaben: { total: string; total_vorjahr: string; budget_total: string };
  ergebnis: string;
  ergebnis_vorjahr: string;
  kostenarten: ProbelaufKostenart[];
  bewertung: { ampel: "rot" | "orange" | "gruen"; bereit_prozent: number; hinweise: Hinweis[] };
}

export type CockpitRolle = "fin" | "buero" | "pruef";
export type AufgabeCode =
  "freigaben" | "belege" | "beitraege" | "projekte" | "abschluss" | "budget_planen";

export interface CockpitAufgabe {
  code: AufgabeCode;
  rollen: CockpitRolle[];
  params: Record<string, unknown>;
  faellig: string;
  ziel: PruefZiel;
}

export interface Cockpit {
  annee: number;
  stand: string;
  freigaben: { anzahl: number; betrag: string };
  belege: { anzahl: number; betrag: string };
  beitraege: { anzahl: number; betrag: string };
  budget: { gesamt: string; verbraucht: string; prozent: number | null; jahr_prozent: number };
  vorjahr: { annee: number; abgeschlossen: boolean };
  prognose: {
    bisher: string;
    kumuliert: string[];
    monatsschnitt: string;
    jahresende: string;
    budget: string;
  };
  aufgaben: CockpitAufgabe[];
}
