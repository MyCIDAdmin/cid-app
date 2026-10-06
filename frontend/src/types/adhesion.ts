/**
 * Types partagés — module adhesions (miroir de apps.adhesions.models /
 * serializers côté backend, AHM-19). Garder synchronisé en cas de
 * changement de schéma.
 */

import type { Uebersetzungen } from "../utils/uebersetzung";

export type StatutCampagne = "brouillon" | "publiee" | "cloturee";

export type StatutSouscription =
  | "brouillon"
  | "en_attente_justificatif"
  | "en_attente_paiement"
  | "payee"
  | "rabais_refuse"
  | "annulee"
  | "expiree";

export type TypeRabais = "etudiant" | "famille" | "senior" | "autre";

export interface AvantageOffre {
  ordre: number;
  texte_fr: string;
  texte_de?: string;
  texte_ar?: string;
}

export interface RabaisOffre {
  id: string;
  offre: string;
  type_rabais: TypeRabais;
  label_fr: string;
  label_de: string;
  label_ar: string;
  montant_reduction: string | null;
  pct_reduction: string | null;
  justificatif_requis: boolean;
  instructions_fr: string;
  instructions_de: string;
  instructions_ar: string;
}

/**
 * Slots de couleur de surlignage d'une offre — miroir de apps.adhesions.models.CouleurOffre
 * (retour utilisateur du 2026-09-29, "Färblich highlighten") : réutilise volontairement les 3
 * mêmes emplacements catégoriels que ACCENTS_OFFRE (MonAdhesionPage.tsx), jamais une couleur
 * libre — voir le docstring backend de CouleurOffre pour la justification. Chaîne vide = pas de
 * choix explicite (attribution automatique par index, comportement historique).
 */
export type CouleurOffre = "" | "cat_1" | "cat_2" | "cat_3";

/** Look der digitalen Mitgliedskarte — Spiegel von apps.adhesions.models.KartenStil. Leer = Rubin. */
export type KartenStil = "weiss" | "silber" | "gold" | "diamant" | "bronze" | "onyx" | "rubin";

export interface OffreAdhesion {
  /** DeepL-Übersetzungen der Textfelder (apps.uebersetzung), siehe utils/uebersetzung. */
  uebersetzungen?: Uebersetzungen;
  id: string;
  campagne: string;
  nom: string;
  prix_plein: string;
  description: string;
  avantages: AvantageOffre[];
  condition_age_min: number | null;
  condition_age_max: number | null;
  visible: boolean;
  ordre: number;
  // Trois champs ajoutés le 2026-09-29 (retour utilisateur, "Verwaltung der
  // Mitgliedschaftskampagnen" : "1. Icons für jede Angebotskachel hochladen 2. Färblich
  // highlighten 3. Tags hinzufügen wie... der Tag 'Popular'") — voir
  // apps.adhesions.models.OffreAdhesion côté backend.
  icone: string | null;
  couleur: CouleurOffre;
  kartenstil?: KartenStil | "";
  populaire: boolean;
  rabais: RabaisOffre[];
}

export interface CampagneAdhesion {
  /** DeepL-Übersetzungen der Textfelder (apps.uebersetzung), siehe utils/uebersetzung. */
  uebersetzungen?: Uebersetzungen;
  id: string;
  nom: string;
  annee: number;
  date_debut: string;
  date_fin: string;
  description: string;
  statut: StatutCampagne;
  /** Frist für Bestandsmitglieder (point 3, 2026-10-06) — null = pas de bascule automatique. */
  date_limite_renouvellement: string | null;
  bascule_non_renouveles_le: string | null;
  created_by: string;
  created_at: string;
  offres: OffreAdhesion[];
}

/**
 * Payload accepté par POST /adhesions/campagnes/ (voir
 * CampagneAdhesionSerializer.Meta.read_only_fields — statut/created_by ne
 * sont jamais transmis par le client : une campagne naît toujours en
 * brouillon, publier/cloturer passent par leurs actions dédiées).
 */
export interface CampagneCreatePayload {
  nom: string;
  annee: number;
  date_debut: string;
  date_fin: string;
  description?: string;
  date_limite_renouvellement?: string | null;
}

/**
 * Payload de POST/PATCH /adhesions/offres/ (OffreAdhesionSerializer — seul `id` est en
 * lecture seule, `rabais` est nichée en lecture seule séparément, AHM-19/demande utilisateur
 * du 2026-09-16 "tool" d'administration des campagnes).
 */
export interface OffreCreatePayload {
  campagne: string;
  nom: string;
  prix_plein: string;
  description?: string;
  avantages?: AvantageOffre[];
  condition_age_min?: number | null;
  condition_age_max?: number | null;
  visible?: boolean;
  ordre?: number;
  // `icone` n'apparaît volontairement pas ici : comme Produit.image (boutique), elle ne se
  // televerse qu'en multipart/form-data via un endpoint dédié — voir televerserIconeOffre.
  couleur?: CouleurOffre;
  kartenstil?: KartenStil | "";
  populaire?: boolean;
}

/** Payload de POST/PATCH /adhesions/rabais/ (RabaisOffreSerializer). */
export interface RabaisCreatePayload {
  offre: string;
  type_rabais: TypeRabais;
  label_fr: string;
  label_de?: string;
  label_ar?: string;
  montant_reduction?: string | null;
  pct_reduction?: string | null;
  justificatif_requis?: boolean;
  instructions_fr?: string;
  instructions_de?: string;
  instructions_ar?: string;
}

export type StatutJustificatif = "en_attente" | "approuve" | "rejete";

/**
 * Miroir de JustificatifRabaisSerializer (AHM-20) — volontairement sans `fichier` : le fichier
 * ne se récupère que via GET /adhesions/justificatifs/{id}/telecharger/ (URL MinIO pré-signée,
 * TTL 15 min), jamais en clair dans cette réponse (voir le docstring backend correspondant).
 */
export interface JustificatifRabais {
  id: string;
  souscription: string;
  type_justificatif: string;
  statut: StatutJustificatif;
  valide_par: string | null;
  date_decision: string | null;
  motif_rejet: string;
  created_at: string;
}

/** Entrée de POST /adhesions/justificatifs/{id}/valider/ (RH+, AHM-20). */
export interface ValiderJustificatifPayload {
  decision: "approuve" | "rejete";
  motif_rejet?: string;
}

export interface Souscription {
  id: string;
  membre: string;
  offre: string;
  campagne: string;
  date_souscription: string;
  prix_paye: string;
  rabais: string | null;
  statut: StatutSouscription;
  cotisation: string | null;
  snapshot_avantages: AvantageOffre[];
  // Nichée en lecture seule par SouscriptionSerializer (AHM-20) — null tant qu'aucun
  // justificatif n'a été uploadé pour cette souscription.
  justificatif: JustificatifRabais | null;
  created_at: string;
  updated_at: string;
}

/**
 * Payload de POST /adhesions/souscriptions/souscrire/ (voir
 * SouscrireSerializer) — ni prix ni statut ne sont envoyés : entièrement
 * recalculés côté serveur (CLAUDE.md §8, voir SouscriptionViewSet.souscrire).
 */
export interface SouscrirePayload {
  offre: string;
  rabais?: string;
}

/**
 * Payload de POST /adhesions/souscriptions/souscrire-especes/ (ajouté le 2026-09-21, retour
 * utilisateur : "Füge mitgliedschaftsbeitrag hinzu mit den aktuellen Angebote", dans le
 * formulaire "Barzahlung eintragen" de CotisationsEnAttentePage) — réservé au Directeur
 * Financier/Admin App, voir SouscrireEspecesSerializer côté backend. Contrairement à
 * SouscrirePayload : `membre` explicite (saisie pour autrui, F-015) et pas de `rabais` (un
 * rabais nécessite un justificatif validé par RH avant paiement, incompatible avec une saisie
 * immédiate en espèces).
 */
export interface SouscrireEspecesPayload {
  membre: string;
  offre: string;
}
