/**
 * Types partagés — module evenements (miroir de apps.evenements.models /
 * serializers côté backend, Phase 2A/2B). Garder synchronisé en cas de
 * changement de schéma.
 */

import type { Uebersetzungen } from "../utils/uebersetzung";

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
  /** DeepL-Übersetzungen der Textfelder (apps.uebersetzung), siehe utils/uebersetzung. */
  uebersetzungen?: Uebersetzungen;
  id: string;
  titre: string;
  type_evenement: TypeEvenement;
  description: string;
  date_evenement: string;
  heure: string | null;
  /** Fin optionnelle (2026-10-06, point 2.4). */
  date_fin: string | null;
  heure_fin: string | null;
  /** Échéance de paiement (point 2.3) — un rappel email part avant cette date si non payé. */
  date_limite_paiement: string | null;
  lieu: string;
  /** Vide pour un non-membre sur un événement réservé aux membres (masqué côté serveur). */
  point_rdv: string;
  /** Lien Google Maps saisi par l'admin (demande utilisateur 2026-09-27, point 11.2) — utilisé
   * uniquement comme cible du lien cliquable, jamais pour générer la vignette d'aperçu (voir
   * components/ui/MapsApercu.tsx). */
  lieu_maps_url: string;
  /** Image de la kachel (page d'accueil publique, demande utilisateur 2026-09-27, point 11.1) —
   * null tant qu'aucune image n'a été téléversée. */
  image: string | null;
  places_max: number | null;
  gratuit: boolean;
  cout: string;
  /** Tarif non-membre (point 3, 2026-10-05) — null = identique à `cout`. */
  cout_non_membre: string | null;
  /** Tarif par place applicable à l'utilisateur courant, calculé côté serveur. */
  cout_applicable: string;
  /** Événement non ouvert aux non-membres (point 1.1) : affichage seul + badge. */
  reserve_membres: boolean;
  /** Begleitpersonen (module "Veranstaltungsverwaltung", 2026-09-25) — indépendant de
   * gratuit/cout : un événement gratuit pour le membre peut tout de même facturer ses
   * accompagnants, et inversement. */
  accompagnants_payants: boolean;
  prix_accompagnant_adulte: string;
  prix_accompagnant_enfant: string;
  /** Purement indicatif côté formulaire d'inscription — celui-ci ne demande que des décomptes
   * adulte/enfant, jamais l'âge exact de chaque accompagnant. */
  age_limite_accompagnant_enfant: number;
  organisateur: string | null;
  organisateur_detail: MembreResume | null;
  statut: StatutEvenement;
  /** Page d'accueil publique façon mycid.org/events (demande utilisateur 2026-09-26) : ouvre
   * cet événement (une fois publié) aux visiteurs non connectés/non-membres. Ne remplace
   * jamais `statut` — un brouillon reste toujours invisible, voir EvenementViewSet.get_queryset. */
  visible_public: boolean;
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
  date_fin?: string | null;
  heure_fin?: string | null;
  date_limite_paiement?: string | null;
  lieu: string;
  point_rdv?: string;
  lieu_maps_url?: string;
  places_max?: number | null;
  gratuit?: boolean;
  cout?: string;
  cout_non_membre?: string | null;
  accompagnants_payants?: boolean;
  prix_accompagnant_adulte?: string;
  prix_accompagnant_enfant?: string;
  age_limite_accompagnant_enfant?: number;
  organisateur?: string | null;
  visible_public?: boolean;
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
  /** Begleitpersonen — décomptes par palier, jamais l'âge individuel de chaque accompagnant
   * (voir Evenement.age_limite_accompagnant_enfant, purement indicatif). */
  nombre_accompagnants_adultes: number;
  nombre_accompagnants_enfants: number;
  regime_alimentaire: RegimeAlimentaire;
  remarques: string;
  /** Recalculé côté serveur = evenement.cout * places + montant des accompagnants — jamais
   * fait confiance au frontend (CLAUDE.md §8). */
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
  nombre_accompagnants_adultes?: number;
  nombre_accompagnants_enfants?: number;
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
  /** Lien Google Maps saisi par le conducteur (demande utilisateur 2026-09-27, point 12.1) —
   * même principe que Evenement.lieu_maps_url : cible du lien cliquable uniquement. */
  lieu_rendez_vous_maps_url: string;
  places_disponibles: number;
  prix_par_place: string | null;
  vehicule: string;
  /** Description / remarque libre du conducteur (demande utilisateur 2026-09-25, "Beschreibung
   * / Anmerkung erfassen") — texte libre, distinct de lieu_rendez_vous. */
  remarques: string;
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
  lieu_rendez_vous_maps_url?: string;
  places_disponibles: number;
  prix_par_place?: string | null;
  vehicule?: string;
  remarques?: string;
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
