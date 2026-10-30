/** Darstellung der Chats : Zeitangaben, Datumstrenner, Farben, Emoji-Auswahl. */
import type { ChatListItem, ChatNachricht } from "../types/chats";

const TAG = 24 * 60 * 60 * 1000;

function tagBeginn(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function uhrzeit(iso: string, sprache?: string): string {
  return new Date(iso).toLocaleTimeString(sprache, { hour: "2-digit", minute: "2-digit" });
}

/** „Heute“/„Gestern“ werden von der Oberfläche übersetzt ; sonst ein kurzes Datum. */
export function tagArt(iso: string, jetzt: number = Date.now()): "heute" | "gestern" | "datum" {
  const diff = Math.round((tagBeginn(new Date(jetzt)) - tagBeginn(new Date(iso))) / TAG);
  if (diff === 0) return "heute";
  if (diff === 1) return "gestern";
  return "datum";
}

export function kurzDatum(iso: string, sprache?: string): string {
  return new Date(iso).toLocaleDateString(sprache, { day: "2-digit", month: "2-digit" });
}

export function langDatum(iso: string, sprache?: string): string {
  return new Date(iso).toLocaleDateString(sprache, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** Zeit in der Chat-Liste : heute die Uhrzeit, sonst das Datum. */
export function listenZeit(iso: string, sprache?: string, jetzt: number = Date.now()): string {
  return tagArt(iso, jetzt) === "heute" ? uhrzeit(iso, sprache) : kurzDatum(iso, sprache);
}

export interface TagesGruppe {
  schluessel: string;
  zeit: string;
  nachrichten: ChatNachricht[];
}

/** Gruppiert Nachrichten (aufsteigend) nach Kalendertag. */
export function nachTagen(nachrichten: ChatNachricht[]): TagesGruppe[] {
  const gruppen: TagesGruppe[] = [];
  for (const n of nachrichten) {
    const d = new Date(n.zeit);
    const schluessel = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const letzte = gruppen[gruppen.length - 1];
    if (letzte && letzte.schluessel === schluessel) letzte.nachrichten.push(n);
    else gruppen.push({ schluessel, zeit: n.zeit, nachrichten: [n] });
  }
  return gruppen;
}

/** Id der Nachricht, vor der „Ab hier neu“ steht : die älteste der letzten `anzahl` fremden
 * Nachrichten. null, wenn nichts ungelesen war. */
export function neuAbId(nachrichten: ChatNachricht[], anzahl: number): string | null {
  if (anzahl <= 0) return null;
  const fremde = nachrichten.filter((n) => !n.ich && n.art !== "system");
  if (fremde.length === 0) return null;
  return fremde[Math.max(0, fremde.length - anzahl)].id;
}

const FARBEN = ["bg-[#2563eb]", "bg-[#0f766e]", "bg-[#7c3aed]", "bg-[#be185d]", "bg-[#c2410c]"];

export function avatarFarbe(schluessel: string): string {
  let h = 0;
  for (const c of schluessel) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return FARBEN[h % FARBEN.length];
}

export function initialen(name: string): string {
  const teile = name.trim().split(/\s+/);
  return `${teile[0]?.charAt(0) ?? ""}${teile.length > 1 ? (teile[teile.length - 1]?.charAt(0) ?? "") : ""}`.toUpperCase();
}

export type ListenFilter = "alle" | "ungelesen" | "personen" | "gruppen" | "reisen";

export function filtereChats(
  chats: ChatListItem[],
  filter: ListenFilter,
  suche: string,
): ChatListItem[] {
  const q = suche.trim().toLowerCase();
  return chats.filter((c) => {
    if (filter === "ungelesen" && c.nicht_gelesen === 0) return false;
    if (filter === "personen" && c.art !== "direkt") return false;
    if (filter === "gruppen" && c.art !== "gruppe") return false;
    if (filter === "reisen" && c.art !== "reise") return false;
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || (c.letzte?.text ?? "").toLowerCase().includes(q);
  });
}

/** Angeheftete zuerst, sonst nach letzter Aktivität. */
export function sortiereChats(chats: ChatListItem[]): ChatListItem[] {
  return [...chats].sort(
    (a, b) =>
      Number(b.angeheftet) - Number(a.angeheftet) ||
      new Date(b.aktivitaet).getTime() - new Date(a.aktivitaet).getTime(),
  );
}

export const SCHNELL_REAKTIONEN = ["👍", "😂", "🔥", "🙏", "😮"] as const;

export const EMOJI_KATEGORIEN: Record<string, string[]> = {
  smileys: [
    "😀",
    "😃",
    "😄",
    "😁",
    "😆",
    "😅",
    "😂",
    "🤣",
    "🙂",
    "😉",
    "😊",
    "😍",
    "🥰",
    "😘",
    "😎",
    "🤩",
    "🥳",
    "😢",
    "😭",
    "😡",
    "🤔",
    "😴",
    "🙄",
    "😮",
  ],
  gesten: [
    "👍",
    "👎",
    "👏",
    "🙌",
    "🙏",
    "💪",
    "👋",
    "🤝",
    "✌️",
    "🤞",
    "👌",
    "🤙",
    "☝️",
    "👀",
    "🫶",
    "❤️",
    "🧡",
    "💛",
    "💚",
    "💙",
    "💜",
    "🖤",
    "💔",
    "🔥",
  ],
  fussball: [
    "⚽",
    "🥅",
    "🏟️",
    "🏆",
    "🥇",
    "🎉",
    "📣",
    "🚩",
    "🟨",
    "🟥",
    "🔴",
    "⚪",
    "🇹🇳",
    "🇩🇪",
    "🇫🇷",
    "🥁",
    "🎺",
    "🎶",
    "🍻",
    "🧣",
  ],
  reise: [
    "✈️",
    "🛫",
    "🛬",
    "🚆",
    "🚗",
    "🚌",
    "🧳",
    "🗺️",
    "📍",
    "🏨",
    "🌍",
    "☀️",
    "🌙",
    "☕",
    "🍽️",
    "🕌",
    "🏜️",
    "🌴",
    "⏰",
    "📅",
  ],
};
