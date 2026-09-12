/**
 * Types partagés — module stats (miroir de apps.stats.services/views côté
 * backend, Phase 2B — FDD §5.3, 3 onglets R1 : Financier, Membres,
 * Événements ; Engagement/Projets restent R2, hors périmètre).
 */

/** Filtres communs aux 3 onglets (mockup #pg-stats, filter-bar). */
export interface StatsFiltres {
  annee?: number;
  ville?: string;
  statut?: string;
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
  top_contributeurs: TopContributeur[];
}

export interface RepartitionVille {
  ville_de: string;
  nombre: number;
}

export interface TrancheAge {
  tranche: string;
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
