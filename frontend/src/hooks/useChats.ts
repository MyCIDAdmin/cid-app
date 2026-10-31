/** Hooks React Query des Moduls „Chats“ (siehe api/chats.ts). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as api from "../api/chats";
import type { ChatArt, ChatFilter } from "../types/chats";

export const chatKeys = {
  liste: ["chats", "liste"] as const,
  dienste: ["chats", "dienste"] as const,
  mitglieder: (id: string) => ["chats", "mitglieder", id] as const,
  mitreisende: ["chats", "mitreisende"] as const,
  gifs: (q: string) => ["chats", "gifs", q] as const,
};

/** Die gemeinsame Chat-Liste. Meldet zugleich „ich bin online“ ; deshalb alle 30 Sekunden. */
export function useChatListe() {
  return useQuery({
    queryKey: chatKeys.liste,
    queryFn: api.listChats,
    refetchInterval: 30_000,
  });
}

export function useChatEinstellung() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { art: ChatArt; id: string } & ChatFilter) =>
      api.setzeEinstellung(v.art, v.id, {
        stumm: v.stumm,
        angeheftet: v.angeheftet,
        nur_erwaehnung: v.nur_erwaehnung,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chatKeys.liste }),
  });
}

/** Welche optionalen Dienste sind aktiv (GIPHY, DeepL) ? Ohne sie zeigt die GIF-Taste einen
 * Hinweis statt der Suche ; die Übersetzen-Taste bleibt ausgeblendet. */
export function useChatDienste() {
  return useQuery({ queryKey: chatKeys.dienste, queryFn: api.getDienste, staleTime: 5 * 60_000 });
}

export function useGifSuche(q: string, aktiv: boolean) {
  return useQuery({
    queryKey: chatKeys.gifs(q),
    queryFn: () => api.sucheGifs(q),
    enabled: aktiv,
    staleTime: 60_000,
  });
}

export function useGruppenMitglieder(id: string | undefined) {
  return useQuery({
    queryKey: chatKeys.mitglieder(id ?? ""),
    queryFn: () => api.listMitglieder(id as string),
    enabled: !!id,
  });
}

export function useMitreisende(aktiv: boolean) {
  return useQuery({ queryKey: chatKeys.mitreisende, queryFn: api.listMitreisende, enabled: aktiv });
}

export function useGruppeGelesen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.gruppeGelesen(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chatKeys.liste }),
  });
}

export function useReagieren(kanal: "direkt" | "gruppe") {
  return useMutation({
    mutationFn: (v: { id: string; emoji: string }) => api.reagiere(kanal, v.id, v.emoji),
  });
}

export function useAnheften(kanal: "direkt" | "gruppe") {
  return useMutation({ mutationFn: (id: string) => api.heftAn(kanal, id) });
}

export function useAbstimmen() {
  return useMutation({
    mutationFn: (v: { id: string; option: number }) => api.stimmeAb(v.id, v.option),
  });
}

export function useUebersetzen() {
  return useMutation({
    mutationFn: (v: { text: string; ziel: "de" | "fr" }) => api.uebersetze(v.text, v.ziel),
  });
}

export function useBearbeiten(kanal: "direkt" | "gruppe") {
  return useMutation({
    mutationFn: (v: { id: string; contenu: string }) =>
      api.bearbeiteNachricht(kanal, v.id, v.contenu),
  });
}

export function useChatAdmin(gruppeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { membreId: string; aktiv: boolean }) =>
      api.setzeChatAdmin(gruppeId, v.membreId, v.aktiv),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.mitglieder(gruppeId) });
      queryClient.invalidateQueries({ queryKey: chatKeys.liste });
    },
  });
}

export function useChatPause(gruppeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { aktiv: boolean; bis?: string }) => api.setzePause(gruppeId, v.aktiv, v.bis),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chatKeys.liste }),
  });
}
