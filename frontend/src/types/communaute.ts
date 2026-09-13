/**
 * Types partagés — module communaute, lot Fil d'actualité + Forum (miroir de
 * apps.communaute.models / serializers côté backend, Phase 4A). Garder synchronisé en cas
 * de changement de schéma.
 */

export type CategorieForum = "football_ca" | "vie_en_allemagne" | "emploi" | "general";

export interface Auteur {
  id: string;
  prenom: string;
  nom: string;
  photo: string | null;
}

export interface Commentaire {
  id: string;
  publication: string;
  parent: string | null;
  auteur: Auteur;
  contenu: string;
  est_masque: boolean;
  created_at: string;
  /** Un seul niveau (voir backend) — vide sur une réponse elle-même. */
  reponses: Commentaire[];
  est_auteur: boolean;
}

export interface Publication {
  id: string;
  auteur: Auteur;
  contenu: string;
  image: string | null;
  hashtags: string[];
  est_masquee: boolean;
  motif_masquage: string;
  created_at: string;
  updated_at: string;
  nombre_likes: number;
  nombre_partages: number;
  nombre_commentaires: number;
  jaime: boolean;
  jai_partage: boolean;
  est_auteur: boolean;
  commentaires: Commentaire[];
}

export interface PublicationPayload {
  contenu: string;
  image?: File;
}

export interface ReponseForum {
  id: string;
  sujet: string;
  auteur: Auteur;
  contenu: string;
  est_masquee: boolean;
  created_at: string;
  est_auteur: boolean;
}

export interface Sujet {
  id: string;
  auteur: Auteur;
  categorie: CategorieForum;
  titre: string;
  contenu: string;
  est_epingle: boolean;
  est_verrouille: boolean;
  est_masque: boolean;
  motif_masquage: string;
  created_at: string;
  updated_at: string;
  nombre_reponses: number;
  /** Uniquement rempli sur le détail (retrieve) — vide dans la liste, voir backend. */
  reponses: ReponseForum[];
  est_auteur: boolean;
}

export interface SujetPayload {
  categorie: CategorieForum;
  titre: string;
  contenu: string;
}
