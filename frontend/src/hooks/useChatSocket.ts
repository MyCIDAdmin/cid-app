/**
 * Ein WebSocket-Hook für beide Chatarten des Moduls „Chats“ :
 *   {VITE_WS_BASE_URL}/messagerie/{id}/  (Direktchat)  und  /groupes/{id}/  (Gruppe, Reisechat).
 * Vertrag wie hooks/useMessagerieSocket.ts / useGroupeChatSocket.ts (die er ersetzt) : Nachrichten
 * werden NUR über diesen Kanal gesendet ; Likes, Reaktionen, Anheften, Umfrage-Stimmen und
 * Löschungen kommen per REST und werden hier als Ereignisse zurückgespielt.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuthStore } from "../store/authStore";
import type { ChatKanal } from "../types/chats";
import type { NachrichtArt, NachrichtDaten } from "../types/communaute";

const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL ?? "ws://localhost:8000/ws";
const TIPPT_ANZEIGE_MS = 4000;
const TIPPT_SENDE_ABSTAND_MS = 2500;

export type StatutConnexion = "connexion" | "ouvert" | "ferme" | "erreur";

/** Rohe Nachricht aus dem Kanal (Direkt- und Gruppenform in einer Hülle). */
export interface SocketNachricht {
  id: string;
  art: NachrichtArt;
  contenu: string;
  daten: NachrichtDaten;
  created_at: string;
  nombre_likes: number;
  repond_a: string | null;
  repond_a_detail: {
    id: string;
    contenu: string;
    auteur?: { prenom: string; nom: string };
    expediteur?: { prenom: string; nom: string };
  } | null;
  /** Gruppe */
  auteur?: { id: string; prenom?: string; nom?: string };
  /** Direkt */
  expediteur?: string;
  angeheftet: boolean;
  reaktionen: { emoji: string; anzahl: number; ich: boolean }[];
  umfrage?: { zaehler: number[]; gesamt: number; meine: number | null; beendet: boolean } | null;
}

export interface SocketEreignisse {
  geloescht: string[];
  likes: { id: string; nombre_likes: number; membre_id: string; aime: boolean }[];
  reaktionen: { id: string; emoji: string; anzahl: number; membre_id: string; aktiv: boolean }[];
  pins: { id: string; angeheftet: boolean }[];
  umfragen: { id: string; zaehler: number[]; gesamt: number }[];
  /** Direktchat : Gegenüber hat gelesen. */
  gelesenVon: string[];
}

const LEER: SocketEreignisse = {
  geloescht: [],
  likes: [],
  reaktionen: [],
  pins: [],
  umfragen: [],
  gelesenVon: [],
};

export interface SendeInhalt {
  contenu?: string;
  art?: NachrichtArt;
  daten?: NachrichtDaten;
  repondA?: string;
}

export interface UseChatSocketResult {
  statut: StatutConnexion;
  messages: SocketNachricht[];
  ereignisse: SocketEreignisse;
  /** Mitglieds-IDs, die gerade tippen (nach 4 s ohne neues Signal wieder entfernt). */
  tippende: string[];
  erreur: string | null;
  envoyer: (inhalt: SendeInhalt) => void;
  tippSignal: () => void;
  marquerLu: () => void;
}

export function useChatSocket(
  kanal: ChatKanal | undefined,
  id: string | undefined,
): UseChatSocketResult {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [statut, setStatut] = useState<StatutConnexion>("connexion");
  const [messages, setMessages] = useState<SocketNachricht[]>([]);
  const [ereignisse, setEreignisse] = useState<SocketEreignisse>(LEER);
  const [tippende, setTippende] = useState<string[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const letztesTippen = useRef(0);
  const timer = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!kanal || !id || !accessToken) return undefined;

    setStatut("connexion");
    setErreur(null);
    setMessages([]);
    setEreignisse(LEER);
    setTippende([]);

    const pfad = kanal === "direkt" ? "messagerie" : "groupes";
    const ws = new WebSocket(
      `${WS_BASE_URL}/${pfad}/${id}/?token=${encodeURIComponent(accessToken)}`,
    );
    wsRef.current = ws;
    const timerKarte = timer.current;

    ws.onopen = () => setStatut("ouvert");
    ws.onmessage = (event) => {
      let m: Record<string, unknown> & { type: string };
      try {
        m = JSON.parse(event.data);
      } catch {
        return;
      }
      const hinzu = <K extends keyof SocketEreignisse>(
        feld: K,
        wert: SocketEreignisse[K][number],
      ) =>
        setEreignisse(
          (e) => ({ ...e, [feld]: [...(e[feld] as unknown[]), wert] }) as SocketEreignisse,
        );
      switch (m.type) {
        case "message":
          setMessages((p) => [...p, m as unknown as SocketNachricht]);
          break;
        case "message_supprime":
          setMessages((p) => p.filter((x) => x.id !== m.id));
          hinzu("geloescht", m.id as string);
          break;
        case "message_like":
          hinzu("likes", m as never);
          break;
        case "message_reaktion":
          hinzu("reaktionen", m as never);
          break;
        case "message_angeheftet":
          hinzu("pins", m as never);
          break;
        case "umfrage_update":
          hinzu("umfragen", m as never);
          break;
        case "lu":
          hinzu("gelesenVon", m.lu_par as string);
          break;
        case "tippt": {
          const wer = m.membre_id as string;
          setTippende((p) => (p.includes(wer) ? p : [...p, wer]));
          window.clearTimeout(timerKarte.get(wer));
          timerKarte.set(
            wer,
            window.setTimeout(
              () => setTippende((p) => p.filter((x) => x !== wer)),
              TIPPT_ANZEIGE_MS,
            ),
          );
          break;
        }
        case "erreur":
          setErreur(m.message as string);
          break;
      }
    };
    ws.onerror = () => setStatut("erreur");
    ws.onclose = () => setStatut("ferme");

    return () => {
      ws.close();
      wsRef.current = null;
      timerKarte.forEach((t) => window.clearTimeout(t));
      timerKarte.clear();
    };
  }, [kanal, id, accessToken]);

  const senden = useCallback((daten: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(daten));
    return true;
  }, []);

  const envoyer = useCallback(
    ({ contenu = "", art = "text", daten = null, repondA }: SendeInhalt) => {
      setErreur(null);
      const ok = senden({ type: "message", contenu, art, daten, repond_a: repondA ?? null });
      if (!ok) setErreur("Verbindung zum Chat verloren – bitte gleich noch einmal versuchen.");
    },
    [senden],
  );

  const tippSignal = useCallback(() => {
    const jetzt = Date.now();
    if (jetzt - letztesTippen.current < TIPPT_SENDE_ABSTAND_MS) return;
    letztesTippen.current = jetzt;
    senden({ type: "tippt" });
  }, [senden]);

  const marquerLu = useCallback(() => {
    senden({ type: "lu" });
  }, [senden]);

  return { statut, messages, ereignisse, tippende, erreur, envoyer, tippSignal, marquerLu };
}
