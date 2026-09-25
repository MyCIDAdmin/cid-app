/**
 * Client API — module communaute, lot Fil d'actualité + Forum (TDD §2.4,
 * backend/apps/communaute/views.py).
 */
import { apiClient } from "./client";
import type { CursorPage } from "../types/membre";
import type {
  Album,
  AlbumPayload,
  Auteur,
  CategorieForum,
  ChoixQuestion,
  ChoixQuestionPayload,
  ClassementLigue,
  Commentaire,
  Conversation,
  EquipeInfo,
  GroupeChat,
  GroupeChatPayload,
  Match,
  MatchCommentaire,
  MatchEvenement,
  MatchEvenementPayload,
  MatchMiseAJourPayload,
  MatchPayload,
  MessageGroupe,
  MessagePrive,
  ParticipationQuiz,
  Photo,
  PhotoCommentaire,
  PhotoUploadPayload,
  Publication,
  PublicationPayload,
  QuestionQuiz,
  QuestionQuizPayload,
  Quiz,
  QuizClassement,
  QuizMiseAJourPayload,
  QuizPayload,
  RencontreCalendrier,
  ReponseForum,
  ReponseQuiz,
  StatistiqueJoueur,
  Sujet,
  SujetPayload,
  Tippspiel,
  TippspielPayload,
  TippspielTeilnahme,
  TippspielTip,
  TippspielTipPayload,
} from "../types/communaute";

// --- Fil d'actualité ---

export interface PublicationsFiltres {
  hashtag?: string;
  auteur?: string;
  cursor?: string;
}

export async function listPublications(
  filtres: PublicationsFiltres = {},
): Promise<CursorPage<Publication>> {
  const { data } = await apiClient.get<CursorPage<Publication>>("/communaute/publications/", {
    params: filtres,
  });
  return data;
}

export async function creerPublication(payload: PublicationPayload): Promise<Publication> {
  if (payload.image || payload.document) {
    const formData = new FormData();
    formData.append("contenu", payload.contenu);
    if (payload.image) formData.append("image", payload.image);
    if (payload.document) formData.append("document", payload.document);
    const { data } = await apiClient.post<Publication>("/communaute/publications/", formData);
    return data;
  }
  const { data } = await apiClient.post<Publication>("/communaute/publications/", {
    contenu: payload.contenu,
  });
  return data;
}

export async function supprimerPublication(id: string): Promise<void> {
  await apiClient.delete(`/communaute/publications/${id}/`);
}

export async function likerPublication(id: string): Promise<Publication> {
  const { data } = await apiClient.post<Publication>(`/communaute/publications/${id}/liker/`);
  return data;
}

export async function partagerPublication(id: string): Promise<Publication> {
  const { data } = await apiClient.post<Publication>(`/communaute/publications/${id}/partager/`);
  return data;
}

export async function masquerPublication(id: string, motif?: string): Promise<Publication> {
  const { data } = await apiClient.post<Publication>(`/communaute/publications/${id}/masquer/`, {
    motif,
  });
  return data;
}

export async function commenterPublication(
  publicationId: string,
  contenu: string,
  parent?: string,
): Promise<Commentaire> {
  const { data } = await apiClient.post<Commentaire>("/communaute/commentaires/", {
    publication: publicationId,
    contenu,
    parent,
  });
  return data;
}

export async function supprimerCommentaire(id: string): Promise<void> {
  await apiClient.delete(`/communaute/commentaires/${id}/`);
}

export async function masquerCommentaire(id: string): Promise<Commentaire> {
  const { data } = await apiClient.post<Commentaire>(`/communaute/commentaires/${id}/masquer/`);
  return data;
}

// --- Forum ---

export interface SujetsFiltres {
  categorie?: CategorieForum;
  auteur?: string;
  cursor?: string;
}

export async function listSujets(filtres: SujetsFiltres = {}): Promise<CursorPage<Sujet>> {
  const { data } = await apiClient.get<CursorPage<Sujet>>("/communaute/sujets/", {
    params: filtres,
  });
  return data;
}

export async function getSujet(id: string): Promise<Sujet> {
  const { data } = await apiClient.get<Sujet>(`/communaute/sujets/${id}/`);
  return data;
}

export async function creerSujet(payload: SujetPayload): Promise<Sujet> {
  const { data } = await apiClient.post<Sujet>("/communaute/sujets/", payload);
  return data;
}

export async function supprimerSujet(id: string): Promise<void> {
  await apiClient.delete(`/communaute/sujets/${id}/`);
}

export async function epinglerSujet(id: string): Promise<Sujet> {
  const { data } = await apiClient.post<Sujet>(`/communaute/sujets/${id}/epingler/`);
  return data;
}

export async function verrouillerSujet(id: string): Promise<Sujet> {
  const { data } = await apiClient.post<Sujet>(`/communaute/sujets/${id}/verrouiller/`);
  return data;
}

export async function masquerSujet(id: string, motif?: string): Promise<Sujet> {
  const { data } = await apiClient.post<Sujet>(`/communaute/sujets/${id}/masquer/`, { motif });
  return data;
}

export async function repondreAuSujet(sujetId: string, contenu: string): Promise<ReponseForum> {
  const { data } = await apiClient.post<ReponseForum>("/communaute/reponses-forum/", {
    sujet: sujetId,
    contenu,
  });
  return data;
}

export async function supprimerReponseForum(id: string): Promise<void> {
  await apiClient.delete(`/communaute/reponses-forum/${id}/`);
}

export async function masquerReponseForum(id: string): Promise<ReponseForum> {
  const { data } = await apiClient.post<ReponseForum>(`/communaute/reponses-forum/${id}/masquer/`);
  return data;
}

// --- Messagerie privée (REST = historique seul, voir hooks/useMessagerieSocket.ts) ---

export async function listConversations(cursor?: string): Promise<CursorPage<Conversation>> {
  const { data } = await apiClient.get<CursorPage<Conversation>>("/communaute/conversations/", {
    params: { cursor },
  });
  return data;
}

export async function creerConversation(destinataire: string): Promise<Conversation> {
  const { data } = await apiClient.post<Conversation>("/communaute/conversations/", {
    destinataire,
  });
  return data;
}

export async function listMessagesPrives(
  conversationId: string,
  cursor?: string,
): Promise<CursorPage<MessagePrive>> {
  const { data } = await apiClient.get<CursorPage<MessagePrive>>("/communaute/messages-prives/", {
    params: { conversation: conversationId, cursor },
  });
  return data;
}

// Demande utilisateur du 2026-09-16 ("Nachricht ... kann vom Ersteller gelöscht werden") —
// réservé à l'expéditeur côté backend (voir MessagePrivePermission) ; diffusé en temps réel
// aux autres participants via MessagerieConsumer.message_supprime.
export async function supprimerMessagePrive(id: string): Promise<void> {
  await apiClient.delete(`/communaute/messages-prives/${id}/`);
}

// --- Groupes de chat (REST = liste/gestion, voir hooks/useGroupeChatSocket.ts pour l'envoi) ---

export interface GroupesFiltres {
  cursor?: string;
}

export async function listGroupes(filtres: GroupesFiltres = {}): Promise<CursorPage<GroupeChat>> {
  const { data } = await apiClient.get<CursorPage<GroupeChat>>("/communaute/groupes/", {
    params: filtres,
  });
  return data;
}

export async function getGroupe(id: string): Promise<GroupeChat> {
  const { data } = await apiClient.get<GroupeChat>(`/communaute/groupes/${id}/`);
  return data;
}

export async function creerGroupe(payload: GroupeChatPayload): Promise<GroupeChat> {
  const { data } = await apiClient.post<GroupeChat>("/communaute/groupes/", payload);
  return data;
}

export async function rejoindreGroupe(id: string): Promise<GroupeChat> {
  const { data } = await apiClient.post<GroupeChat>(`/communaute/groupes/${id}/rejoindre/`);
  return data;
}

export async function quitterGroupe(id: string): Promise<GroupeChat> {
  const { data } = await apiClient.post<GroupeChat>(`/communaute/groupes/${id}/quitter/`);
  return data;
}

// Demande utilisateur du 2026-09-16 ("Besprechungen ... vom Ersteller gelöscht werden") —
// réservé au créateur (ou Bureau Admin+) côté backend, voir GroupeChatPermission.
export async function supprimerGroupe(id: string): Promise<void> {
  await apiClient.delete(`/communaute/groupes/${id}/`);
}

export async function inviterAuGroupe(id: string, membres: string[]): Promise<GroupeChat> {
  const { data } = await apiClient.post<GroupeChat>(`/communaute/groupes/${id}/inviter/`, {
    membres,
  });
  return data;
}

export async function listMessagesGroupe(
  groupeId: string,
  cursor?: string,
): Promise<CursorPage<MessageGroupe>> {
  const { data } = await apiClient.get<CursorPage<MessageGroupe>>("/communaute/messages-groupe/", {
    params: { groupe: groupeId, cursor },
  });
  return data;
}

// Demande utilisateur du 2026-09-16 — réservé à l'auteur côté backend (voir
// MessageGroupePermission) ; diffusé en temps réel aux autres membres du groupe via
// GroupeChatConsumer.message_supprime.
export async function supprimerMessageGroupe(id: string): Promise<void> {
  await apiClient.delete(`/communaute/messages-groupe/${id}/`);
}

// --- Recherche de membres (démarrer une conversation, inviter dans un groupe) — distinct de
// apps/membres (réservé RH+, voir MembreRechercheViewSet côté backend), 2 caractères min. ---

export async function rechercherMembres(q: string): Promise<Auteur[]> {
  // Sans recherche (q vide), le backend renvoie une liste parcourable par défaut plutôt qu'une
  // liste vide — voir MembreRechercheViewSet.get_queryset côté backend — pour permettre de
  // choisir un destinataire sans devoir taper son nom (bug remonté en test manuel Phase 4).
  const recherche = q.trim();
  const { data } = await apiClient.get<CursorPage<Auteur>>("/communaute/membres-recherche/", {
    params: recherche ? { q: recherche } : {},
  });
  return data.results;
}

// --- Live Match (REST = gestion/historique, voir hooks/useLiveMatchSocket.ts pour les
// commentaires/réactions temps réel — troisième lot, Phase 4B) ---

export interface MatchsFiltres {
  cursor?: string;
}

export async function listMatchs(filtres: MatchsFiltres = {}): Promise<CursorPage<Match>> {
  const { data } = await apiClient.get<CursorPage<Match>>("/communaute/matchs/", {
    params: filtres,
  });
  return data;
}

export async function getMatch(id: string): Promise<Match> {
  const { data } = await apiClient.get<Match>(`/communaute/matchs/${id}/`);
  return data;
}

export async function creerMatch(payload: MatchPayload): Promise<Match> {
  const { data } = await apiClient.post<Match>("/communaute/matchs/", payload);
  return data;
}

export async function modifierMatch(id: string, payload: MatchMiseAJourPayload): Promise<Match> {
  const { data } = await apiClient.patch<Match>(`/communaute/matchs/${id}/`, payload);
  return data;
}

export async function listMatchCommentaires(
  matchId: string,
  cursor?: string,
): Promise<CursorPage<MatchCommentaire>> {
  const { data } = await apiClient.get<CursorPage<MatchCommentaire>>(
    "/communaute/match-commentaires/",
    { params: { match: matchId, cursor } },
  );
  return data;
}

// --- Fan-Club — classement/calendrier/statistiques joueurs/événements (extension du Live
// Match, 2026-09-24, voir backend apps.communaute.services pour la synchronisation GOAL
// API) ---

// Une seule page (PAGE_SIZE=20, voir settings/base.py) ne couvre pas forcément un
// classement (jusqu'à ~20 équipes) ni surtout l'effectif complet (73 joueurs testés) : ces
// deux endpoints parcourent donc systématiquement toutes les pages (`next`, une URL
// absolue générée par CursorPagination) — même correctif que `listCalendrierRencontres()`
// ci-dessous, suite au même type de retour utilisateur ("Tabelle ist falsch und Listet
// Daten aus alten Säsons", 2026-09-24) : le backend filtre désormais par saison courante
// par défaut (`ClassementLigueViewSet`/`StatistiqueJoueurViewSet.get_queryset()`), mais une
// page unique aurait quand même tronqué l'effectif/la tableau une fois plusieurs
// équipes/joueurs synchronisés. `PAGINATION_MAX_PAGES` est un garde-fou, pas une limite
// attendue.
const PAGINATION_MAX_PAGES = 20;

async function listerToutesLesPages<T>(urlInitiale: string): Promise<CursorPage<T>> {
  let url: string | null = urlInitiale;
  let tous: T[] = [];
  for (let page = 0; page < PAGINATION_MAX_PAGES && url; page += 1) {
    const { data }: { data: CursorPage<T> } = await apiClient.get<CursorPage<T>>(url);
    tous = tous.concat(data.results);
    url = data.next;
  }
  return { next: null, previous: null, results: tous };
}

export async function listClassementLigue(): Promise<CursorPage<ClassementLigue>> {
  return listerToutesLesPages<ClassementLigue>("/communaute/classement/");
}

export async function listCalendrierRencontres(): Promise<CursorPage<RencontreCalendrier>> {
  return listerToutesLesPages<RencontreCalendrier>("/communaute/calendrier/");
}

export async function listStatistiquesJoueurs(): Promise<CursorPage<StatistiqueJoueur>> {
  return listerToutesLesPages<StatistiqueJoueur>("/communaute/statistiques-joueurs/");
}

// Singleton (pas de pagination — voir EquipeInfoViewSet.list côté backend, qui renvoie
// directement l'objet).
export async function getEquipeInfo(): Promise<EquipeInfo> {
  const { data } = await apiClient.get<EquipeInfo>("/communaute/equipe-info/");
  return data;
}

export async function listMatchEvenements(
  matchId: string,
  cursor?: string,
): Promise<CursorPage<MatchEvenement>> {
  const { data } = await apiClient.get<CursorPage<MatchEvenement>>(
    "/communaute/match-evenements/",
    {
      params: { match: matchId, cursor },
    },
  );
  return data;
}

export async function creerMatchEvenement(payload: MatchEvenementPayload): Promise<MatchEvenement> {
  const { data } = await apiClient.post<MatchEvenement>("/communaute/match-evenements/", payload);
  return data;
}

// --- Tippspiel (pronostics Ligue 1, 2026-09-24) — voir backend apps.communaute.views
// pour le détail des permissions par action. ---

export interface TippspieleFiltres {
  cursor?: string;
}

export async function listTippspiele(
  filtres: TippspieleFiltres = {},
): Promise<CursorPage<Tippspiel>> {
  const { data } = await apiClient.get<CursorPage<Tippspiel>>("/communaute/tippspiel/", {
    params: filtres,
  });
  return data;
}

// Réservé Administrateur App (super_admin) — voir TippspielPermission côté backend.
export async function creerTippspiel(payload: TippspielPayload): Promise<Tippspiel> {
  const { data } = await apiClient.post<Tippspiel>("/communaute/tippspiel/", payload);
  return data;
}

export async function modifierTippspiel(
  id: string,
  payload: Partial<TippspielPayload>,
): Promise<Tippspiel> {
  const { data } = await apiClient.patch<Tippspiel>(`/communaute/tippspiel/${id}/`, payload);
  return data;
}

// "Jeder Mitglied kann daran teilnehmen" (retour utilisateur) — tout authentifié.
export async function teilnehmenTippspiel(id: string): Promise<TippspielTeilnahme> {
  const { data } = await apiClient.post<TippspielTeilnahme>(
    `/communaute/tippspiel/${id}/teilnehmen/`,
  );
  return data;
}

export interface TippspielTeilnahmenFiltres {
  /** Requis pour le classement/`?mine=` — optionnel pour `statutPaiement:"en_attente"`,
   * qui liste alors les paiements en attente à travers TOUS les Tippspiele (voir
   * docstring de tête TippspielTeilnahmeViewSet côté backend, 2026-09-24). */
  tippspiel?: string;
  /** `true` : ma propre inscription (quel que soit son statut de paiement). Omis ou
   * `false` : classement (participations confirmées uniquement), sauf si
   * `statutPaiement` est renseigné. */
  mine?: boolean;
  /** `"en_attente"` : liste des paiements à confirmer — réservé Directeur Financier+
   * côté backend (voir TippspielTeilnahmeViewSet.get_queryset). */
  statutPaiement?: "en_attente";
  cursor?: string;
}

export async function listTippspielTeilnahmen(
  filtres: TippspielTeilnahmenFiltres,
): Promise<CursorPage<TippspielTeilnahme>> {
  const { tippspiel, mine, statutPaiement, cursor } = filtres;
  const { data } = await apiClient.get<CursorPage<TippspielTeilnahme>>(
    "/communaute/tippspiel-teilnahmen/",
    {
      params: {
        tippspiel,
        mine: mine ? "true" : undefined,
        statut_paiement: statutPaiement,
        cursor,
      },
    },
  );
  return data;
}

// "bestätigt vom Finanzdirektor" (retour utilisateur) — réservé Directeur Financier+.
export async function confirmerPaiementTeilnahme(id: string): Promise<TippspielTeilnahme> {
  const { data } = await apiClient.post<TippspielTeilnahme>(
    `/communaute/tippspiel-teilnahmen/${id}/confirmer-paiement/`,
  );
  return data;
}

export interface TippspielTippsFiltres {
  tippspiel?: string;
  cursor?: string;
}

// Toujours filtré côté backend sur mes propres pronostics (IDOR, voir
// TippspielTipViewSet.get_queryset) — jamais ceux d'un autre membre.
export async function listTippspielTipps(
  filtres: TippspielTippsFiltres = {},
): Promise<CursorPage<TippspielTip>> {
  const { data } = await apiClient.get<CursorPage<TippspielTip>>("/communaute/tippspiel-tipps/", {
    params: filtres,
  });
  return data;
}

export async function creerTippspielTip(payload: TippspielTipPayload): Promise<TippspielTip> {
  const { data } = await apiClient.post<TippspielTip>("/communaute/tippspiel-tipps/", payload);
  return data;
}

export async function modifierTippspielTip(
  id: string,
  payload: Pick<TippspielTipPayload, "score_domicile" | "score_exterieur">,
): Promise<TippspielTip> {
  const { data } = await apiClient.patch<TippspielTip>(
    `/communaute/tippspiel-tipps/${id}/`,
    payload,
  );
  return data;
}

// --- Albums photos (troisième lot, Phase 4B) ---

export interface AlbumsFiltres {
  cursor?: string;
}

export async function listAlbums(filtres: AlbumsFiltres = {}): Promise<CursorPage<Album>> {
  const { data } = await apiClient.get<CursorPage<Album>>("/communaute/albums/", {
    params: filtres,
  });
  return data;
}

export async function getAlbum(id: string): Promise<Album> {
  const { data } = await apiClient.get<Album>(`/communaute/albums/${id}/`);
  return data;
}

export async function creerAlbum(payload: AlbumPayload): Promise<Album> {
  const { data } = await apiClient.post<Album>("/communaute/albums/", payload);
  return data;
}

// Gestion complète (modifier/supprimer) réservée à Bureau Admin+ depuis le 2026-09-22 (voir
// AlbumPermission côté backend) — utilisées uniquement par AdminAlbumsPage.
export async function modifierAlbum(id: string, payload: AlbumPayload): Promise<Album> {
  const { data } = await apiClient.patch<Album>(`/communaute/albums/${id}/`, payload);
  return data;
}

export async function supprimerAlbum(id: string): Promise<void> {
  await apiClient.delete(`/communaute/albums/${id}/`);
}

export interface PhotosFiltres {
  album?: string;
  cursor?: string;
}

export async function listPhotos(filtres: PhotosFiltres = {}): Promise<CursorPage<Photo>> {
  const { data } = await apiClient.get<CursorPage<Photo>>("/communaute/photos/", {
    params: filtres,
  });
  return data;
}

export async function uploaderPhoto(payload: PhotoUploadPayload): Promise<Photo> {
  const formData = new FormData();
  formData.append("album", payload.album);
  formData.append("image", payload.image);
  if (payload.legende) formData.append("legende", payload.legende);
  const { data } = await apiClient.post<Photo>("/communaute/photos/", formData);
  return data;
}

export async function supprimerPhoto(id: string): Promise<void> {
  await apiClient.delete(`/communaute/photos/${id}/`);
}

export async function likerPhoto(id: string): Promise<Photo> {
  const { data } = await apiClient.post<Photo>(`/communaute/photos/${id}/liker/`);
  return data;
}

export async function masquerPhoto(id: string): Promise<Photo> {
  const { data } = await apiClient.post<Photo>(`/communaute/photos/${id}/masquer/`);
  return data;
}

export async function commenterPhoto(photoId: string, contenu: string): Promise<PhotoCommentaire> {
  const { data } = await apiClient.post<PhotoCommentaire>("/communaute/photo-commentaires/", {
    photo: photoId,
    contenu,
  });
  return data;
}

// --- Quiz (troisième lot, Phase 4B) ---

export interface QuizFiltres {
  cursor?: string;
}

export async function listQuiz(filtres: QuizFiltres = {}): Promise<CursorPage<Quiz>> {
  const { data } = await apiClient.get<CursorPage<Quiz>>("/communaute/quiz/", {
    params: filtres,
  });
  return data;
}

export async function getQuiz(id: string): Promise<Quiz> {
  const { data } = await apiClient.get<Quiz>(`/communaute/quiz/${id}/`);
  return data;
}

export async function demarrerQuiz(id: string): Promise<ParticipationQuiz> {
  const { data } = await apiClient.post<ParticipationQuiz>(`/communaute/quiz/${id}/demarrer/`);
  return data;
}

export async function repondreQuiz(
  quizId: string,
  question: string,
  choix: string,
): Promise<ReponseQuiz> {
  const { data } = await apiClient.post<ReponseQuiz>(`/communaute/quiz/${quizId}/repondre/`, {
    question,
    choix,
  });
  return data;
}

export async function classementQuiz(id: string): Promise<QuizClassement> {
  const { data } = await apiClient.get<QuizClassement>(`/communaute/quiz/${id}/classement/`);
  return data;
}

// --- Gestion Quiz (Bureau Admin+ — création/édition questions & choix, voir
// GestionQuizPermission côté backend ; distinct du jeu ci-dessus) ---

export async function creerQuiz(payload: QuizPayload): Promise<Quiz> {
  const { data } = await apiClient.post<Quiz>("/communaute/quiz/", payload);
  return data;
}

export async function modifierQuiz(id: string, payload: QuizMiseAJourPayload): Promise<Quiz> {
  const { data } = await apiClient.patch<Quiz>(`/communaute/quiz/${id}/`, payload);
  return data;
}

export async function supprimerQuiz(id: string): Promise<void> {
  await apiClient.delete(`/communaute/quiz/${id}/`);
}

export async function creerQuestionQuiz(payload: QuestionQuizPayload): Promise<QuestionQuiz> {
  const { data } = await apiClient.post<QuestionQuiz>("/communaute/quiz-questions/", payload);
  return data;
}

export async function supprimerQuestionQuiz(id: string): Promise<void> {
  await apiClient.delete(`/communaute/quiz-questions/${id}/`);
}

export async function creerChoixQuestion(payload: ChoixQuestionPayload): Promise<ChoixQuestion> {
  const { data } = await apiClient.post<ChoixQuestion>("/communaute/quiz-choix/", payload);
  return data;
}

export async function supprimerChoixQuestion(id: string): Promise<void> {
  await apiClient.delete(`/communaute/quiz-choix/${id}/`);
}
