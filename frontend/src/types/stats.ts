/**
 * Types partagés — module stats (miroir de apps.stats.services/views côté
 * backend, Phase 2B — FDD §5.3, 3 onglets R1 : Financier, Membres,
 * Événements ; Engagement/Projets restent R2, hors périmètre).
 */

import type { KategorieNamen } from "../utils/kategorie";

/** Filtres communs aux 3 onglets (mockup #pg-stats, filter-bar). land/pays/date_adhesion_*
 * ajoutés le 2026-09-19 (demande utilisateur : "Bei ... Statistiken & KPIs füge mehr
 * Filtermöglichten hinzu z.B. Bundesland") — voir apps.stats.views.BaseStatsView._filtres_communs
 * côté backend. */
export interface StatsFiltres {
  annee?: number;
  ville?: string;
  statut?: string;
  land?: string;
  pays?: string;
  date_adhesion_apres?: string;
  date_adhesion_avant?: string;
}

export interface TopContributeur {
  membre_id: string;
  nom: string;
  cotisations: string;
  evenements: string;
  dons: string;
  total: string;
}

export interface KpisFinancier {
  annee: number;
  solde: string;
  recettes: string;
  depenses: string;
  taux_collecte: number;
  cotisations_en_attente: string;
  revenus_boutique: string;
  revenus_adhesions: string;
  revenus_evenements: string;
  revenus_projets: string;
  top_contributeurs: TopContributeur[];
}

export interface RepartitionVille {
  ville_de: string;
  nombre: number;
}

export interface TrancheAge {
  tranche: string;
  age_min?: number;
  age_max?: number | null;
  nombre: number;
}

export interface KpisMembres {
  total: number;
  actifs: number;
  inactifs: number;
  par_ville: RepartitionVille[];
  pyramide_ages: TrancheAge[];
}

export interface RepartitionType {
  type_evenement: string;
  nombre: number;
}

export interface ParticipationEvenement {
  id: string;
  titre: string;
  places_reservees: number;
  places_max: number | null;
}

export interface KpisEvenements {
  annee: number;
  nombre_evenements: number;
  taux_remplissage_moyen: number;
  inscriptions_totales: number;
  revenus: string;
  par_type: RepartitionType[];
  participation_par_evenement: ParticipationEvenement[];
}

/**
 * Onglet "Finanzdaten" (ajouté le 2026-09-25, demande utilisateur : "Tab für alle Finanzdaten
 * (filterbar/sortierbar)") — miroir de apps.stats.services.TYPES_TRANSACTION/finances_liste
 * côté backend.
 */
export type TypeTransaction =
  "cotisation" | "don" | "adhesion" | "evenement" | "boutique" | "autre" | "projet" | "depense";

export interface FinanceRecord {
  id: string;
  type: TypeTransaction;
  date: string;
  membre_id: string;
  membre_nom: string;
  description: string;
  montant: string;
  statut: string;
}

/** Jahresbilanz (apps.stats.bilan.bilan_annuel) — montants en chaînes décimales. */
export type SourceRecette =
  "cotisations" | "dons" | "projets" | "adhesions" | "boutique" | "evenements";

export interface LigneRecetteBilan {
  cle: SourceRecette;
  montant: string;
  montant_precedent: string;
}

export type StatutBudget = "aucun" | "ok" | "attention" | "depasse";

export interface LigneDepenseBilan {
  categorie_id: string;
  nom: string;
  namen?: KategorieNamen;
  montant: string;
  montant_precedent: string;
  budget: string;
  ecart: string | null;
  pourcentage_budget: number | null;
  statut_budget: StatutBudget;
}

export interface MoisBilan {
  mois: number;
  recettes: string;
  depenses: string;
  cumul: string;
}

export interface ResultatBilan {
  id: string;
  titre: string;
  date?: string;
  recettes: string;
  depenses: string;
  resultat: string;
}

export interface Bilan {
  annee: number;
  recettes: { lignes: LigneRecetteBilan[]; total: string; total_precedent: string };
  depenses: {
    lignes: LigneDepenseBilan[];
    total: string;
    total_precedent: string;
    budget_total: string;
  };
  resultat: string;
  resultat_precedent: string;
  mensuel: MoisBilan[];
  abschluss: {
    abgeschlossen: boolean;
    abgeschlossen_am?: string;
    resultat_eingefroren?: string;
    abweichung?: string;
  };
  depenses_en_attente: { nombre: number; montant: string };
  resultats_evenements: ResultatBilan[];
  resultats_projets: ResultatBilan[];
}

/** Projekt-Kennzahlen (2026-10-07) — miroir de apps.stats.services.kpis_projets. */
export interface ProjektKennzahlZeile {
  id: string;
  titre: string;
  statut: string;
  sichtbarkeit: "entwurf" | "veroeffentlicht";
  team: number;
  aufgaben_gesamt: number;
  aufgaben_erledigt: number;
  prozent: number;
  ueberfaellig: number;
  plan: string;
  ist: string;
  offen: string;
  einnahmen: string;
  ergebnis: string;
}

export interface KpisProjets {
  projekte_gesamt: number;
  veroeffentlicht: number;
  entwurf: number;
  nach_status: { statut: string; nombre: number }[];
  aufgaben: {
    gesamt: number;
    erledigt: number;
    ueberfaellig: number;
    quote: number;
    pro_status: Record<string, number>;
  };
  kosten: {
    plan: string;
    ist: string;
    offen: string;
    einnahmen: string;
    ergebnis: string;
    auslastung: number | null;
  };
  projekte: ProjektKennzahlZeile[];
}

export type PivotDimension = "jahr" | "quartal" | "monat" | "typ" | "kategorie" | "gegenpartei";
export type PivotKennzahl = "betrag" | "anzahl" | "durchschnitt";

export interface PivotAbfrage {
  zeilen: PivotDimension;
  spalten: PivotDimension | "";
  kennzahl: PivotKennzahl;
  jahr_von: number;
  jahr_bis: number;
}

export interface PivotErgebnis {
  zeilen_dim: PivotDimension;
  spalten_dim: PivotDimension | null;
  kennzahl: PivotKennzahl;
  jahr_von: number;
  jahr_bis: number;
  spalten: string[];
  zeilen: { label: string; werte: number[]; summe: number }[];
  spalten_summen: number[];
  gesamt: number;
  anzahl_buchungen: number;
}
