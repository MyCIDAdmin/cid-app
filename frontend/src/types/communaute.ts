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
  document: string | null;
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
  document?: File;
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
  /** Utilisé pour n'afficher "Supprimer le groupe" qu'au créateur (demande utilisateur du
   * 2026-09-16, "Besprechungen ... vom Ersteller gelöscht werden") — voir GroupeChatPage. */
  est_createur: boolean;
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
  | {
      type: "message";
      id: string;
      conversation: string;
      expediteur: string;
      contenu: string;
      est_lu: boolean;
      created_at: string;
    }
  | { type: "lu"; conversation: string; lu_par: string }
  // Diffusé par MessagePriveViewSet (REST, expéditeur uniquement — demande utilisateur du
  // 2026-09-16) via MessagerieConsumer.message_supprime, voir hooks/useMessagerieSocket.ts.
  | { type: "message_supprime"; id: string }
  | { type: "erreur"; message: string };

export type GroupeChatSocketMessage =
  | {
      type: "message";
      id: string;
      groupe: string;
      auteur: Auteur;
      contenu: string;
      created_at: string;
    }
  // Diffusé par MessageGroupeViewSet (REST, auteur uniquement) via
  // GroupeChatConsumer.message_supprime, voir hooks/useGroupeChatSocket.ts.
  | { type: "message_supprime"; id: string }
  | { type: "erreur"; message: string };

// --- Live Match, Albums, Quiz (troisième lot — Phase 4B, miroir de
// apps.communaute.models/serializers, voir backend CLAUDE.md §7) ---

export type StatutMatch = "a_venir" | "en_cours" | "termine";

/** Miroir de TypeReactionMatch (backend) — toutes les clés sont toujours présentes dans
 * `Match.reactions`, même à 0 (voir MatchSerializer.get_reactions). */
export type TypeReactionMatch = "coeur" | "feu" | "etoile" | "surprise";

export type ReactionsMatch = Record<TypeReactionMatch, number>;

export interface Match {
  id: string;
  adversaire: string;
  competition: string;
  lieu: string;
  date_heure: string;
  statut: StatutMatch;
  score_ca: number;
  score_adversaire: number;
  minute_chrono: number;
  created_at: string;
  updated_at: string;
  reactions: ReactionsMatch;
}

export interface MatchPayload {
  adversaire: string;
  competition?: string;
  lieu?: string;
  date_heure: string;
}

/** Sous-ensemble éditable par un modérateur en cours de match (score/chrono/statut) — voir
 * MatchViewSet (PATCH), distinct de MatchPayload (création). */
export interface MatchMiseAJourPayload {
  statut?: StatutMatch;
  score_ca?: number;
  score_adversaire?: number;
  minute_chrono?: number;
}

export interface MatchCommentaire {
  id: string;
  match: string;
  auteur: Auteur;
  contenu: string;
  created_at: string;
}

// --- Fan-Club — extension du Live Match (2026-09-24), miroir de
// apps.communaute.models/serializers (ClassementLigue/RencontreCalendrier/
// StatistiqueJoueur/MatchEvenement) ---

/** Ligne de tableau de classement — toujours en lecture seule côté frontend, synchronisée
 * périodiquement depuis GOAL API (voir backend apps.communaute.services). Champs
 * `*_domicile`/`*_exterieur`/`zone_texte` ajoutés lors de la bascule SerpApi → GOAL API
 * (2026-09-24, GOAL API renvoie nativement la répartition domicile/extérieur). */
export interface ClassementLigue {
  id: string;
  saison: string;
  equipe: string;
  rang: number;
  joues: number;
  victoires: number;
  nuls: number;
  defaites: number;
  buts_pour: number;
  buts_contre: number;
  difference: number;
  points: number;
  forme_recente: string;
  joues_domicile: number;
  victoires_domicile: number;
  nuls_domicile: number;
  defaites_domicile: number;
  buts_pour_domicile: number;
  buts_contre_domicile: number;
  points_domicile: number;
  joues_exterieur: number;
  victoires_exterieur: number;
  nuls_exterieur: number;
  defaites_exterieur: number;
  buts_pour_exterieur: number;
  buts_contre_exterieur: number;
  points_exterieur: number;
  zone_texte: string;
  maj_le: string;
}

/** Reprend telles quelles les valeurs `matchStatus` de GOAL API (voir
 * apps.communaute.models.StatutRencontre). */
export type StatutRencontre = "SCHEDULED" | "FINISHED" | "POSTPONED" | "CANCELLED";

/** Une rencontre du calendrier (passée ou à venir), toutes compétitions confondues —
 * distincte de `Match` ci-dessus, qui reste réservé aux matchs pilotés en direct par un
 * modérateur (Live-Ticker). `statut` ajouté lors de la bascule SerpApi → GOAL API
 * (2026-09-24) : calendrier désormais complet (GOAL API), le statut de chaque rencontre
 * est fiable plutôt qu'inféré depuis la seule date. */
export interface RencontreCalendrier {
  id: string;
  competition: string;
  equipe_domicile: string;
  equipe_exterieur: string;
  date_heure: string;
  score_domicile: number | null;
  score_exterieur: number | null;
  statut: StatutRencontre;
  est_a_venir: boolean;
  maj_le: string;
}

/** Statistiques individuelles d'un joueur (saison en cours), synchronisées depuis GOAL API
 * — voir apps.communaute.models.StatistiqueJoueur. Alimente les listes Torschützen/
 * Kartenstatistik, indisponibles tant que le module reposait sur SerpApi/Google Sports. */
export interface StatistiqueJoueur {
  id: string;
  saison: string;
  equipe: string;
  nom: string;
  numero: number | null;
  poste: string;
  matchs_joues: number;
  buts: number;
  passes_decisives: number;
  cartons_jaunes: number;
  cartons_rouges: number;
  maj_le: string;
}

export type TypeEvenementMatch =
  | "coup_envoi"
  | "but"
  | "carton_jaune"
  | "carton_rouge"
  | "remplacement"
  | "mi_temps"
  | "fin_match";

export type EquipeEvenement = "ca" | "adversaire" | "";

/** Journal d'événements du Live-Ticker (buts/cartons/etc.) — voir
 * apps.communaute.models.MatchEvenement, diffusé en direct via LiveMatchConsumer. */
export interface MatchEvenement {
  id: string;
  match: string;
  type_evenement: TypeEvenementMatch;
  minute: number;
  equipe: EquipeEvenement;
  joueur: string;
  description: string;
  created_by_nom: string;
  created_at: string;
}

/** Payload de création — réservé Bureau Admin+ (voir MatchEvenementPermission). */
export interface MatchEvenementPayload {
  match: string;
  type_evenement: TypeEvenementMatch;
  minute: number;
  equipe?: EquipeEvenement;
  joueur?: string;
  description?: string;
}

// --- Albums photos ---

/** `evenement` est en lecture seule côté API (voir AlbumSerializer.get_evenement côté
 * backend) — aucun écran ne permet encore de le renseigner, seul l'admin Django le peut.
 * `date`/`lieu` (ajoutés le 2026-09-22, "Analog zum Modul Projekte eine Beschreibung zu
 * erfassen, das Datum und den Ort") : saisie libre à la création, distincts de `evenement`. */
export interface Album {
  id: string;
  nom: string;
  description: string;
  date: string | null;
  lieu: string;
  evenement: { id: string; titre: string } | null;
  createur: Auteur;
  created_at: string;
  nombre_photos: number;
}

export interface AlbumPayload {
  nom: string;
  description?: string;
  date?: string | null;
  lieu?: string;
}

export interface PhotoCommentaire {
  id: string;
  photo: string;
  auteur: Auteur;
  contenu: string;
  created_at: string;
}

export interface Photo {
  id: string;
  album: string;
  membre: Auteur;
  image: string;
  legende: string;
  est_masquee: boolean;
  created_at: string;
  nombre_likes: number;
  jaime: boolean;
  est_proprietaire: boolean;
  commentaires: PhotoCommentaire[];
}

export interface PhotoUploadPayload {
  album: string;
  image: File;
  legende?: string;
}

// --- Quiz ---

export interface ChoixQuestion {
  id: string;
  question: string;
  texte: string;
  /** Absent pour un membre standard tant qu'il n'a pas répondu — voir
   * ChoixQuestionSerializer.to_representation (Bureau Admin+ uniquement en lecture). */
  est_correct?: boolean;
}

export interface QuestionQuiz {
  id: string;
  quiz: string;
  texte: string;
  ordre: number;
  points: number;
  choix: ChoixQuestion[];
}

export interface ParticipationQuiz {
  id: string;
  quiz: string;
  membre: Auteur;
  score: number;
  demarree_le: string;
  terminee_le: string | null;
  temps_total_secondes: number | null;
}

export interface Quiz {
  id: string;
  titre: string;
  description: string;
  est_actif: boolean;
  created_at: string;
  questions: QuestionQuiz[];
  nombre_questions: number;
  /** Ma propre participation, si j'ai déjà démarré ce quiz — voir QuizSerializer
   * .get_ma_participation. */
  ma_participation: ParticipationQuiz | null;
}

export interface ReponseQuiz {
  id: string;
  participation: string;
  question: string;
  choix: string;
  est_correct: boolean;
  points_obtenus: number;
  created_at: string;
}

export interface QuizClassement {
  classement: ParticipationQuiz[];
  ma_participation?: ParticipationQuiz;
}

// --- Gestion Quiz (Bureau Admin+, voir GestionQuizPermission côté backend) ---

export interface QuizPayload {
  titre: string;
  description?: string;
  est_actif?: boolean;
}

export interface QuizMiseAJourPayload {
  titre?: string;
  description?: string;
  est_actif?: boolean;
}

export interface QuestionQuizPayload {
  quiz: string;
  texte: string;
  ordre?: number;
  points?: number;
}

export interface ChoixQuestionPayload {
  question: string;
  texte: string;
  est_correct?: boolean;
}

// --- Messages WebSocket LiveMatchConsumer ---

export type LiveMatchSocketMessage =
  | {
      type: "commentaire";
      id: string;
      match: string;
      auteur: Auteur;
      contenu: string;
      created_at: string;
    }
  | { type: "reaction"; reactions: ReactionsMatch }
  | { type: "presence"; connectes: number }
  | {
      type: "match";
      id: string;
      statut: StatutMatch;
      score_ca: number;
      score_adversaire: number;
      minute_chrono: number;
    }
  // Module Fan-Club (2026-09-24) — diffusé par MatchEvenementViewSet (REST, Bureau
  // Admin+) via LiveMatchConsumer.match_evenement, voir hooks/useLiveMatchSocket.ts.
  | ({ type: "match_evenement" } & MatchEvenement)
  | { type: "erreur"; message: string };
