/**
 * Types partagés — module evenements (miroir de apps.evenements.models /
 * serializers côté backend, Phase 2A/2B). Garder synchronisé en cas de
 * changement de schéma.
 */

export type TypeEvenement = "deplacement" | "fete" | "conference" | "tournoi" | "ag";
export type StatutEvenement = "brouillon" | "publie" | "annule";
export type RegimeAlimentaire = "aucun" | "halal" | "vegetarien";
export type StatutInscription = "en_attente_paiement" | "confirmee" | "annulee";
export type StatutReservationCovoiturage = "confirmee" | "annulee";

/** Identité minimale d'un membre (voir MembreResumeSerializer côté backend) — même principe
 * que Auteur (apps.communaute), dupliqué ici plutôt qu'importé pour ne pas créer de dépendance
 * entre modules frontend qui n'en ont pas besoin. */
export interface MembreResume {
  id: string;
  prenom: string;
  nom: string;
}

export interface Evenement {
  id: string;
  titre: string;
  type_evenement: TypeEvenement;
  description: string;
  date_evenement: string;
  heure: string | null;
  lieu: string;
  point_rdv: string;
  places_max: number | null;
  gratuit: boolean;
  cout: string;
  organisateur: string | null;
  organisateur_detail: MembreResume | null;
  statut: StatutEvenement;
  /** Toujours recalculées côté serveur (CLAUDE.md §8) — jamais déduites côté client. */
  places_reservees: number;
  places_restantes: number | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** Payload de POST/PATCH /evenements/evenements/ (Bureau Admin+, EvenementPermission). */
export interface EvenementPayload {
  titre: string;
  type_evenement: TypeEvenement;
  description: string;
  date_evenement: string;
  heure?: string | null;
  lieu: string;
  point_rdv?: string;
  places_max?: number | null;
  gratuit?: boolean;
  cout?: string;
  organisateur?: string | null;
}

/** Résumé minimal d'un événement, imbriqué en lecture dans Inscription (voir
 * EvenementResumeSerializer côté backend). */
export interface EvenementResume {
  id: string;
  titre: string;
  date_evenement: string;
  heure: string | null;
  lieu: string;
  cout: string;
  gratuit: boolean;
  statut: StatutEvenement;
}

export interface Inscription {
  id: string;
  evenement: string;
  evenement_detail: EvenementResume | null;
  membre: string;
  places: number;
  regime_alimentaire: RegimeAlimentaire;
  remarques: string;
  /** Recalculé côté serveur = evenement.cout * places — jamais fait confiance au frontend
   * (CLAUDE.md §8). */
  montant_paye: string;
  statut: StatutInscription;
  cotisation: string | null;
  created_at: string;
  updated_at: string;
}

/** Entrée de POST /evenements/evenements/inscrire/ — le montant n'est jamais envoyé, voir
 * InscrirePayload/EvenementViewSet.inscrire côté backend. */
export interface InscrirePayload {
  evenement: string;
  places: number;
  regime_alimentaire?: RegimeAlimentaire;
  remarques?: string;
}

/**
 * Entrée de POST /evenements/evenements/inscrire-especes/ (ajouté le 2026-09-21, retour
 * utilisateur : "Event als Artikeltyp hinzufügen" dans le formulaire "Barzahlung eintragen" de
 * CotisationsEnAttentePage) — même forme que InscrirePayload, plus `membre` explicite :
 * réservé au Directeur Financier/Admin pour inscrire un AUTRE membre avec paiement cash
 * immédiat (voir apps.evenements.views.EvenementViewSet.inscrire_especes côté backend).
 */
export interface InscrireEspecesPayload extends InscrirePayload {
  membre: string;
}

export interface Covoiturage {
  id: string;
  conducteur: string;
  conducteur_detail: MembreResume | null;
  evenement: string | null;
  depart: string;
  destination: string;
  date_trajet: string;
  heure_trajet: string;
  /** Point de rendez-vous fixé par le conducteur pour l'ensemble du trajet ("Treffpunkt") —
   * distinct de ReservationCovoiturage.point_prise_en_charge (propre à chaque passager). */
  lieu_rendez_vous: string;
  places_disponibles: number;
  prix_par_place: string | null;
  vehicule: string;
  places_reservees: number;
  places_restantes: number;
  created_at: string;
}

/** Payload de POST/PATCH /evenements/covoiturages/ (create : tout authentifié pour soi-même ;
 * update : conducteur du trajet ou Bureau Admin+, voir CovoiturageWritePermission). */
export interface CovoituragePayload {
  evenement?: string | null;
  depart: string;
  destination: string;
  date_trajet: string;
  heure_trajet: string;
  lieu_rendez_vous?: string;
  places_disponibles: number;
  prix_par_place?: string | null;
  vehicule?: string;
}

export interface ReservationCovoiturage {
  id: string;
  trajet: string;
  membre: string;
  membre_detail: MembreResume | null;
  places_reservees: number;
  point_prise_en_charge: string;
  statut: StatutReservationCovoiturage;
  created_at: string;
}

/** Entrée de POST /evenements/covoiturages/{id}/rejoindre/. */
export interface RejoindreTrajetPayload {
  places_reservees: number;
  point_prise_en_charge?: string;
}
