/**
 * Hook WebSocket temps réel — module communaute, Groupes de chat
 * (apps.communaute.consumers.GroupeChatConsumer). Même contrat que
 * hooks/useVoteSocket.ts / hooks/useMessagerieSocket.ts (voir leurs docstrings).
 *
 * {VITE_WS_BASE_URL}/groupes/{groupe_id}/?token=<JWT>
 *
 * Envoyer un message passe EXCLUSIVEMENT par ce canal — jamais par un POST REST. Rejoindre
 * un groupe reste une action REST explicite (voir useRejoindreGroupe) : ce hook ne se
 * connecte utilement qu'une fois l'appartenance déjà acquise (sinon le serveur refuse la
 * connexion, voir GroupeChatConsumer.connect()).
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuthStore } from "../store/authStore";
import type { GroupeChatSocketMessage } from "../types/communaute";

const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL ?? "ws://localhost:8000/ws";

type StatutConnexion = "connexion" | "ouvert" | "ferme" | "erreur";

export interface UseGroupeChatSocketResult {
  statut: StatutConnexion;
  messages: Extract<GroupeChatSocketMessage, { type: "message" }>[];
  erreur: string | null;
  envoyer: (contenu: string) => void;
}

export function useGroupeChatSocket(groupeId: string | undefined): UseGroupeChatSocketResult {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [statut, setStatut] = useState<StatutConnexion>("connexion");
  const [messages, setMessages] = useState<
    Extract<GroupeChatSocketMessage, { type: "message" }>[]
  >([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!groupeId || !accessToken) return undefined;

    setStatut("connexion");
    setErreur(null);
    setMessages([]);

    const url = `${WS_BASE_URL}/groupes/${groupeId}/?token=${encodeURIComponent(accessToken)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setStatut("ouvert");

    ws.onmessage = (event) => {
      let message: GroupeChatSocketMessage;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      switch (message.type) {
        case "message":
          setMessages((precedents) => [...precedents, message]);
          break;
        case "erreur":
          setErreur(message.message);
          break;
      }
    };

    ws.onerror = () => setStatut("erreur");
    ws.onclose = () => setStatut("ferme");

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [groupeId, accessToken]);

  const envoyer = useCallback((contenu: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setErreur("Connexion au groupe perdue — veuillez réessayer dans un instant.");
      return;
    }
    setErreur(null);
    ws.send(JSON.stringify({ type: "message", contenu }));
  }, []);

  return { statut, messages, erreur, envoyer };
}
