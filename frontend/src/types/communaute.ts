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

// --- Messagerie privée + Groupes de chat ---
// REST = historique/liste uniquement — envoyer un message passe exclusivement par
// WebSocket (voir hooks/useMessagerieSocket.ts, hooks/useGroupeChatSocket.ts), miroir
// exact du découpage backend (apps.communaute.consumers).

export type TypeGroupe = "public" | "prive";

export interface DernierMessage {
  contenu: string;
  expediteur: string;
  created_at: string;
  est_lu: boolean;
}

export interface Conversation {
  id: string;
  autre_participant: Auteur | null;
  dernier_message: DernierMessage | null;
  nombre_non_lus: number;
  created_at: string;
}

export interface MessagePrive {
  id: string;
  conversation: string;
  expediteur: string;
  contenu: string;
  est_lu: boolean;
  lu_le: string | null;
  created_at: string;
  est_expediteur: boolean;
}

export interface GroupeChat {
  id: string;
  nom: string;
  description: string;
  type_groupe: TypeGroupe;
  createur: Auteur;
  created_at: string;
  nombre_membres: number;
  est_membre: boolean;
}

export interface GroupeChatPayload {
  nom: string;
  description?: string;
  type_groupe: TypeGroupe;
  membres_invites?: string[];
}

export interface MessageGroupe {
  id: string;
  groupe: string;
  auteur: Auteur;
  contenu: string;
  created_at: string;
  est_auteur: boolean;
}

// --- Messages WebSocket (miroir de apps.communaute.consumers) ---

export type MessagerieSocketMessage =
  | { type: "message"; id: string; conversation: string; expediteur: string; contenu: string; est_lu: boolean; created_at: string }
  | { type: "lu"; conversation: string; lu_par: string }
  | { type: "erreur"; message: string };

export type GroupeChatSocketMessage =
  | { type: "message"; id: string; groupe: string; auteur: Auteur; contenu: string; created_at: string }
  | { type: "erreur"; message: string };
