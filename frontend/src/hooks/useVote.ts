/**
 * Hooks React Query — module vote (mockup #pg-vote / #m-create-vote, FDD §3.5, SCD §7.5).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as voteApi from "../api/vote";
import type { VoteSessionsFiltres } from "../api/vote";
import type { VoteSessionCreatePayload } from "../types/vote";

const voteKeys = {
  all: ["vote"] as const,
  sessions: (filtres: VoteSessionsFiltres) => [...voteKeys.all, "sessions", filtres] as const,
  session: (id: string) => [...voteKeys.all, "session", id] as const,
  resultats: (id: string) => [...voteKeys.all, "resultats", id] as const,
};

/** Session active (`statut=ouverte`) — au plus une à la fois côté UI (mockup #vote-tab-actif). */
export function useSessionVoteActive() {
  return useQuery({
    queryKey: voteKeys.sessions({ statut: "ouverte" }),
    queryFn: () => voteApi.listVoteSessions({ statut: "ouverte" }),
    // Filet de sécurité si le WebSocket est momentanément indisponible : le compteur/timer
    // reste malgré tout à jour via un polling REST discret.
    refetchInterval: 30_000,
  });
}

export function useHistoriqueVote(page = 1) {
  return useQuery({
    queryKey: voteKeys.sessions({ statut: "cloturee", page }),
    queryFn: () => voteApi.listVoteSessions({ statut: "cloturee", page }),
  });
}

export function useVoteSession(id: string | undefined) {
  return useQuery({
    queryKey: voteKeys.session(id ?? ""),
    queryFn: () => voteApi.getVoteSession(id as string),
    enabled: Boolean(id),
  });
}

/** 403 tant que la session n'est pas clôturée (SCD §7.5) — n'interroger qu'après clôture. */
export function useResultatsVote(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: voteKeys.resultats(id ?? ""),
    queryFn: () => voteApi.getResultatsVoteSession(id as string),
    enabled: Boolean(id) && enabled,
  });
}

export function useCreerVoteSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: VoteSessionCreatePayload) => voteApi.creerVoteSession(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: voteKeys.all });
    },
  });
}

export function useCloturerVoteSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => voteApi.cloturerVoteSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: voteKeys.all });
    },
  });
}
