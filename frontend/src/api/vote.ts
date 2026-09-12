/**
 * Client API — module vote (TDD, backend/apps/vote/views.py). La soumission du bulletin lui-
 * même ne passe PAS par ce client REST — elle se fait exclusivement via le WebSocket, voir
 * hooks/useVoteSocket.ts (même contrat que apps.vote.consumers.VoteConsumer).
 */
import { apiClient } from "./client";
import type {
  Resultats,
  StatutSession,
  VotePage,
  VoteSession,
  VoteSessionCreatePayload,
} from "../types/vote";

export interface VoteSessionsFiltres {
  statut?: StatutSession;
  page?: number;
}

export async function listVoteSessions(
  filtres: VoteSessionsFiltres = {},
): Promise<VotePage<VoteSession>> {
  const { data } = await apiClient.get<VotePage<VoteSession>>("/votes/", { params: filtres });
  return data;
}

export async function getVoteSession(id: string): Promise<VoteSession> {
  const { data } = await apiClient.get<VoteSession>(`/votes/${id}/`);
  return data;
}

export async function creerVoteSession(payload: VoteSessionCreatePayload): Promise<VoteSession> {
  const { data } = await apiClient.post<VoteSession>("/votes/", payload);
  return data;
}

export async function cloturerVoteSession(id: string): Promise<VoteSession> {
  const { data } = await apiClient.post<VoteSession>(`/votes/${id}/cloturer/`);
  return data;
}

/** 403 tant que la session n'est pas clôturée (SCD §7.5) — voir VoteSessionViewSet.resultats. */
export async function getResultatsVoteSession(id: string): Promise<Resultats> {
  const { data } = await apiClient.get<Resultats>(`/votes/${id}/resultats/`);
  return data;
}
