/**
 * Types partagés — module projets ("Projets & Actions", demande utilisateur du 2026-09-22 —
 * miroir de apps.projets.models/serializers côté backend). Garder synchronisé en cas de
 * changement de schéma.
 */

export type StatutProjet = "en_preparation" | "en_cours" | "termine" | "annule";

/** Identité minimale d'un membre en lecture imbriquée (responsable, auteur d'une mise à jour,
 * contributeur) — même principe et même duplication volontaire que MembreResume
 * (types/evenements.ts) : pas de dépendance entre modules frontend qui n'en ont pas besoin.
 * `photo` est le chemin/URL renvoyé tel quel par le serializer (ImageField), jamais reconstruit
 * côté client. */
export interface MembreResumeProjet {
  id: string;
  prenom: string;
  nom: string;
  photo: string | null;
}

export interface ProjetImage {
  id: string;
  projet: string;
  image: string;
  ordre: number;
  uploaded_by: string | null;
  created_at: string;
}

export interface ProjetMiseAJourImage {
  id: string;
  mise_a_jour: string;
  image: string;
  ordre: number;
  created_at: string;
}

export interface ProjetMiseAJour {
  id: string;
  projet: string;
  titre: string;
  contenu_html: string;
  images: ProjetMiseAJourImage[];
  created_by: string | null;
  created_by_detail: MembreResumeProjet | null;
  created_at: string;
}

export interface Projet {
  id: string;
  titre: string;
  /** Texte riche produit par l'éditeur type Word (demande utilisateur point 1.2) — affiché tel
   * quel (dangerouslySetInnerHTML côté page), jamais retapé/reconstruit côté client. */
  description_html: string;
  statut: StatutProjet;
  responsable: string | null;
  responsable_detail: MembreResumeProjet | null;
  /** Demande utilisateur point 2 : active/désactive les contributions libres. */
  cagnote_active: boolean;
  objectif_montant: string | null;
  /** Toujours recalculé côté serveur (CLAUDE.md §8) — jamais dénormalisé, jamais déduit côté
   * client à partir des contributions individuelles. */
  montant_collecte: string;
  /** Idem — jamais déduit du tableau `images`/`contributeurs` côté client. */
  nb_contributeurs: number;
  date_limite: string | null;
  /** Calculé côté serveur à partir de `date_limite` — bloque une nouvelle contribution (voir
   * hooks/useCotisations.useContribuerProjet). */
  echeance_depassee: boolean;
  ordre: number;
  images: ProjetImage[];
  /** Calculé côté serveur (Bureau Admin+ OU responsable de CE projet précis, voir
   * apps.projets.permissions.est_gestionnaire_projet) — jamais recalculé côté client en
   * comparant un id de membre : CidUser (store d'auth) et Membre sont deux modèles distincts
   * liés en 1-to-1 côté backend, le frontend n'a donc aucun moyen fiable de faire cette
   * comparaison lui-même. Pilote l'affichage conditionnel du formulaire d'ajout de mise à
   * jour dans le rapport d'avancement (demande utilisateur point 7). */
  est_gestionnaire: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Payload de POST/PATCH /projets/projets/ — réservé au Bureau Admin+ côté backend
 * (ProjetPermission). `responsable` peut être laissé vide (aucun responsable assigné). */
export interface ProjetPayload {
  titre: string;
  description_html?: string;
  statut?: StatutProjet;
  responsable?: string | null;
  cagnote_active?: boolean;
  objectif_montant?: string | null;
  date_limite?: string | null;
  ordre?: number;
}

/** Payload multipart de POST /projets/images/ — Bureau Admin+ OU responsable DU PROJET ciblé
 * (voir apps.projets.permissions.est_gestionnaire_projet). `projet` est immuable après création
 * (toute tentative de le modifier via PATCH est silencieusement ignorée côté serveur, voir
 * ProjetImageSerializer.update). */
export interface ProjetImagePayload {
  projet: string;
  image: File;
  ordre?: number;
}

/** Payload de POST/PATCH /projets/mises-a-jour/ (rapport d'avancement, demande utilisateur
 * point 7) — même règle d'écriture que ProjetImagePayload. `projet` immuable après création. */
export interface ProjetMiseAJourPayload {
  projet: string;
  titre: string;
  contenu_html?: string;
}

/** Payload multipart de POST /projets/mises-a-jour-images/ — même règle d'écriture, dérivée du
 * projet de la mise à jour référencée. */
export interface ProjetMiseAJourImagePayload {
  mise_a_jour: string;
  image: File;
  ordre?: number;
}

/**
 * Une ligne de la face arrière de la kachel (demande utilisateur point 5, "Details zu den
 * Mitgliedern die beigetragen haben") — réponse de GET /projets/projets/{id}/contributeurs/,
 * agrégée côté serveur sur le registre Cotisation, jamais une Cotisation individuelle (voir
 * ContributeurSerializer côté backend).
 */
export interface Contributeur {
  membre: MembreResumeProjet;
  montant_total: string;
  derniere_contribution: string;
}
