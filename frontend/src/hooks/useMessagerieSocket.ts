/**
 * Hook WebSocket temps réel — module communaute, Messagerie privée
 * (apps.communaute.consumers.MessagerieConsumer). Même contrat que
 * hooks/useVoteSocket.ts (voir son docstring pour le détail de {VITE_WS_BASE_URL}, déjà
 * préfixé `/ws`, et le choix du WebSocket natif plutôt que socket.io-client).
 *
 * {VITE_WS_BASE_URL}/messagerie/{conversation_id}/?token=<JWT>
 *
 * Envoyer un message ou marquer une conversation comme lue passe EXCLUSIVEMENT par ce
 * canal — jamais par un POST REST (voir consumers.py docstring et api/communaute.ts, qui
 * n'expose que la lecture de l'historique).
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuthStore } from "../store/authStore";
import type { MessagerieSocketMessage } from "../types/communaute";

const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL ?? "ws://localhost:8000/ws";

type StatutConnexion = "connexion" | "ouvert" | "ferme" | "erreur";

export interface UseMessagerieSocketResult {
  statut: StatutConnexion;
  messages: Extract<MessagerieSocketMessage, { type: "message" }>[];
  erreur: string | null;
  envoyer: (contenu: string) => void;
  marquerLu: () => void;
}

export function useMessagerieSocket(conversationId: string | undefined): UseMessagerieSocketResult {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [statut, setStatut] = useState<StatutConnexion>("connexion");
  const [messages, setMessages] = useState<
    Extract<MessagerieSocketMessage, { type: "message" }>[]
  >([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!conversationId || !accessToken) return undefined;

    setStatut("connexion");
    setErreur(null);
    setMessages([]);

    const url = `${WS_BASE_URL}/messagerie/${conversationId}/?token=${encodeURIComponent(accessToken)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setStatut("ouvert");

    ws.onmessage = (event) => {
      let message: MessagerieSocketMessage;
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
        case "lu":
          // L'accusé de lecture est consommé ailleurs (React Query, invalidation manuelle
          // de l'historique) — ce hook n'en garde pas d'état dédié pour rester simple.
          break;
      }
    };

    ws.onerror = () => setStatut("erreur");
    ws.onclose = () => setStatut("ferme");

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [conversationId, accessToken]);

  const envoyer = useCallback((contenu: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setErreur("Connexion à la messagerie perdue — veuillez réessayer dans un instant.");
      return;
    }
    setErreur(null);
    ws.send(JSON.stringify({ type: "message", contenu }));
  }, []);

  const marquerLu = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "lu" }));
  }, []);

  return { statut, messages, erreur, envoyer, marquerLu };
}
