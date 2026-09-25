/**
 * Types partagés — module vote (miroir de apps.vote.models/serializers/services côté
 * backend, Phase 3 — FDD §3.5/§5.2, SDD §2.3, SCD §7.5). Le sel d'anonymat (anonymat_sel)
 * n'apparaît dans AUCUN type ici : il n'est jamais exposé par l'API (voir serializers.py).
 */

export type TypeVote = "unique" | "multiple" | "oui_non" | "preferentiel";

export type ModeAnonymat = "anonyme" | "nominatif";

export type EligibiliteVote = "tous_actifs" | "cotisants" | "bureau" | "selection_manuelle";

export type StatutSession = "ouverte" | "cloturee";

/** VoteSessionViewSet utilise PageNumberPagination (page_size=20), pas la pagination par
 * curseur des autres modules (voir CursorPage dans types/membre.ts) — forme standard DRF. */
export interface VotePage<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface VoteOptionCandidat {
  id: string;
  nom: string;
  ordre: number;
}

/** Composition d'une liste (FDD §5.2 : "plusieurs listes de candidats peuvent se
 * présenter", ex. élection du bureau directeur). Une VoteOption reste l'unité de vote —
 * `candidats` est vide pour un candidat individuel classique (rétrocompatible). */
export interface VoteOption {
  id: string;
  label: string;
  description: string;
  ordre: number;
  candidats: VoteOptionCandidat[];
}

export interface VoteOptionCandidatInput {
  nom: string;
}

export interface VoteOptionInput {
  label: string;
  description?: string;
  candidats?: VoteOptionCandidatInput[];
}

export interface VoteSession {
  id: string;
  titre: string;
  description: string;
  type_vote: TypeVote;
  mode_anonymat: ModeAnonymat;
  nb_choix_max: number;
  eligibilite: EligibiliteVote;
  duree_minutes: number;
  /** % des voix exprimées que l'option en tête doit dépasser STRICTEMENT pour que le vote
   * soit considéré comme décidé — null = pas de seuil (majorité simple/relative suffit).
   * Renommé le 2026-09-25 (ex `quorum_pct`, un quorum de PARTICIPATION comparé avec >= —
   * ne correspondait pas au besoin réel, voir apps.vote.models.VoteSession côté backend). */
  seuil_victoire_pct: number | null;
  statut: StatutSession;
  date_ouverture: string;
  date_fin: string;
  date_cloture: string | null;
  options: VoteOption[];
  total_participants: number;
  total_eligibles: number;
  resultats_visibles: boolean;
  created_by: number;
  created_at: string;
}

/** Payload de création — mockup #m-create-vote, wizard 3 étapes soumis en un seul POST. */
export interface VoteSessionCreatePayload {
  titre: string;
  description: string;
  type_vote: TypeVote;
  mode_anonymat: ModeAnonymat;
  nb_choix_max: number;
  eligibilite: EligibiliteVote;
  membres_selectionnes?: string[];
  duree_minutes: number;
  seuil_victoire_pct?: number | null;
  resultats_visibles_avant_cloture?: boolean;
  options: VoteOptionInput[];
}

export interface ResultatOption {
  option_id: string;
  label: string;
  nombre_voix: number;
  pct: number;
  /** Composition de la liste (noms), vide pour un candidat individuel — voir VoteOption. */
  candidats: string[];
}

/** Miroir de services.calculer_resultats — résultats agrégés, jamais de token. */
export interface Resultats {
  session_id: string;
  statut: StatutSession;
  total_participants: number;
  total_eligibles: number;
  taux_participation: number;
  seuil_victoire_requis: number | null;
  seuil_victoire_atteint: boolean;
  resultats: ResultatOption[];
}

/** Payload WebSocket diffusé pendant que la session est ouverte (SCD §7.5 : jamais les
 * comptages par option, uniquement le nombre de participants — mockup #vote-count-live). */
export interface ParticipationUpdate {
  type: "participation_update";
  session_id: string;
  total_participants: number;
  total_eligibles: number;
  pct: number;
  temps_restant_secondes: number;
}

export interface ResultatsDisponiblesMessage {
  type: "resultats_disponibles";
  resultats: Resultats;
}

export interface ErreurMessage {
  type: "erreur";
  message: string;
}

export interface VoteEnregistreMessage {
  type: "vote_enregistre";
}

export type VoteSocketMessage =
  ParticipationUpdate | ResultatsDisponiblesMessage | ErreurMessage | VoteEnregistreMessage;

/** Message envoyé par le client — {"type": "voter", "choix": [...]}` (BulletinSubmitSerializer). */
export interface VoterMessage {
  type: "voter";
  choix: string[];
}
