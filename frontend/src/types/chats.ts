/** Typen des Moduls „Chats“ (Zusammenführung von Nachrichten und Chatgruppen, Oktober 2026) —
 * Spiegel von apps.communaute.chats. */
import type { Auteur, NachrichtArt, NachrichtDaten, Reaktion, UmfrageErgebnis } from "./communaute";

export type ChatArt = "direkt" | "gruppe" | "reise";

/** Kanal der WebSocket-Verbindung : „reise“ ist technisch eine Gruppe. */
export type ChatKanal = "direkt" | "gruppe";

export interface ChatLetzte {
  text: string;
  art: NachrichtArt;
  ich: boolean;
  von: string;
  zeit: string;
}

export interface ChatListItem {
  art: ChatArt;
  id: string;
  name: string;
  partner: Auteur | null;
  online: boolean | null;
  privat: boolean | null;
  anzahl_mitglieder: number;
  reise: { id: string; titel: string } | null;
  nicht_gelesen: number;
  stumm: boolean;
  angeheftet: boolean;
  /** Gruppen : nur bei @Erwähnung benachrichtigen. */
  nur_erwaehnung: boolean;
  /** Ich bin Chat-Admin (Ersteller oder ernannt) ; im Direktchat immer false. */
  ich_admin: boolean;
  /** Schreibpause : nur Chat-Admins schreiben. `pause_bis` = Ende (ISO) oder null. */
  pausiert: boolean;
  pause_bis: string | null;
  letzte: ChatLetzte | null;
  aktivitaet: string;
}

export interface ChatFilter {
  stumm?: boolean;
  angeheftet?: boolean;
  nur_erwaehnung?: boolean;
}

export interface GruppenMitglied extends Auteur {
  ist_ersteller: boolean;
  ist_admin: boolean;
}

export interface MitreisendeReise {
  id: string;
  titel: string;
  mitglieder: { id: string; prenom: string; nom: string }[];
}

export interface GifErgebnis {
  id: string;
  url: string;
  vorschau: string;
  titel: string;
}

export interface ChatDienste {
  gif: boolean;
  uebersetzung: boolean;
}

/** Eine Nachricht in der Oberfläche — gleiche Form für Direkt- und Gruppenchats. */
export interface ChatNachricht {
  id: string;
  art: NachrichtArt;
  text: string;
  daten: NachrichtDaten;
  vonId: string | null;
  vonName: string;
  ich: boolean;
  zeit: string;
  likes: number;
  jaime: boolean;
  reaktionen: Reaktion[];
  angeheftet: boolean;
  antwort: { id: string; text: string; name: string } | null;
  umfrage: UmfrageErgebnis | null;
  /** Nur Direktchat, nur eigene Nachrichten. */
  gelesen: boolean;
  /** Zeitpunkt der letzten Bearbeitung (nur Text) und ob ein Chat-Admin sie vorgenommen hat. */
  bearbeitetAm: string | null;
  bearbeitetVonAdmin: boolean;
}
