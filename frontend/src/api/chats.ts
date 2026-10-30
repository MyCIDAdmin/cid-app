/** REST-Zugriffe des Moduls „Chats“ (siehe apps.communaute.chats). Der Versand von Nachrichten
 * läuft weiterhin ausschließlich über WebSocket. */
import { apiClient } from "./client";
import type { Reaktion } from "../types/communaute";
import type {
  ChatArt,
  ChatDienste,
  ChatFilter,
  ChatListItem,
  GifErgebnis,
  GruppenMitglied,
  MitreisendeReise,
} from "../types/chats";
import type { MessageGroupe, MessagePrive, UmfrageErgebnis } from "../types/communaute";

export async function listChats(): Promise<ChatListItem[]> {
  const { data } = await apiClient.get<ChatListItem[]>("/communaute/chats/");
  return data;
}

export async function setzeEinstellung(
  art: ChatArt,
  id: string,
  aenderung: ChatFilter,
): Promise<{ stumm: boolean; angeheftet: boolean }> {
  const { data } = await apiClient.patch("/communaute/chats/einstellung/", {
    art,
    id,
    ...aenderung,
  });
  return data;
}

export async function getDienste(): Promise<ChatDienste> {
  const { data } = await apiClient.get<ChatDienste>("/communaute/gifs/status/");
  return data;
}

export async function sucheGifs(q: string): Promise<GifErgebnis[]> {
  const { data } = await apiClient.get<{ ergebnisse: GifErgebnis[] }>("/communaute/gifs/", {
    params: q ? { q } : {},
  });
  return data.ergebnisse;
}

export async function uebersetze(text: string, ziel: "de" | "fr"): Promise<string> {
  const { data } = await apiClient.post<{ text: string }>("/communaute/uebersetzen/", {
    text,
    ziel,
  });
  return data.text;
}

export async function listMitglieder(gruppeId: string): Promise<GruppenMitglied[]> {
  const { data } = await apiClient.get<GruppenMitglied[]>(
    `/communaute/groupes/${gruppeId}/mitglieder/`,
  );
  return data;
}

export async function listMitreisende(): Promise<MitreisendeReise[]> {
  const { data } = await apiClient.get<MitreisendeReise[]>("/communaute/chats/mitreisende/");
  return data;
}

export async function gruppeGelesen(gruppeId: string): Promise<void> {
  await apiClient.post(`/communaute/groupes/${gruppeId}/gelesen/`);
}

type Basis = "messages-prives" | "messages-groupe";
const basis = (kanal: "direkt" | "gruppe"): Basis =>
  kanal === "direkt" ? "messages-prives" : "messages-groupe";

export async function reagiere(
  kanal: "direkt" | "gruppe",
  id: string,
  emoji: string,
): Promise<{ reaktionen: Reaktion[] }> {
  const { data } = await apiClient.post<MessagePrive | MessageGroupe>(
    `/communaute/${basis(kanal)}/${id}/reagieren/`,
    { emoji },
  );
  return data;
}

export async function heftAn(kanal: "direkt" | "gruppe", id: string): Promise<void> {
  await apiClient.post(`/communaute/${basis(kanal)}/${id}/anheften/`);
}

export async function stimmeAb(id: string, option: number): Promise<UmfrageErgebnis | null> {
  const { data } = await apiClient.post<MessageGroupe>(
    `/communaute/messages-groupe/${id}/abstimmen/`,
    { option },
  );
  return data.umfrage;
}
