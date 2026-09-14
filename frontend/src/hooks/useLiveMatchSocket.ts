/**
 * Hook WebSocket temps réel — module communaute, Live Match (troisième lot, Phase 4B,
 * apps.communaute.consumers.LiveMatchConsumer). Même contrat que hooks/useMessagerieSocket.ts
 * / hooks/useGroupeChatSocket.ts (voir leurs docstrings pour {VITE_WS_BASE_URL} et le choix
 * du WebSocket natif).
 *
 * {VITE_WS_BASE_URL}/live/{match_id}/?token=<JWT>
 *
 * Envoyer un commentaire ou une réaction passe EXCLUSIVEMENT par ce canal — jamais par un
 * POST REST (voir consumers.py docstring). Le score/chrono/statut, eux, sont modifiés
 * côté REST par un modérateur (voir hooks/useCommunaute.ts useModifierMatch) puis diffusés
 * ici via le message `{type: "match"}` — ce hook les reçoit mais ne les envoie jamais.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuthStore } from "../store/authStore";
import type { LiveMatchSocketMessage, ReactionsMatch, TypeReactionMatch } from "../types/communaute";

const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL ?? "ws://localhost:8000/ws";

type StatutConnexion = "connexion" | "ouvert" | "ferme" | "erreur";

export interface UseLiveMatchSocketResult {
  statut: StatutConnexion;
  commentaires: Extract<LiveMatchSocketMessage, { type: "commentaire" }>[];
  reactions: ReactionsMatch | null;
  connectes: number;
  miseAJourMatch: Extract<LiveMatchSocketMessage, { type: "match" }> | null;
  erreur: string | null;
  envoyerCommentaire: (contenu: string) => void;
  envoyerReaction: (emoji: TypeReactionMatch) => void;
}

export function useLiveMatchSocket(matchId: string | undefined): UseLiveMatchSocketResult {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [statut, setStatut] = useState<StatutConnexion>("connexion");
  const [commentaires, setCommentaires] = useState<
    Extract<LiveMatchSocketMessage, { type: "commentaire" }>[]
  >([]);
  const [reactions, setReactions] = useState<ReactionsMatch | null>(null);
  const [connectes, setConnectes] = useState(0);
  const [miseAJourMatch, setMiseAJourMatch] = useState<
    Extract<LiveMatchSocketMessage, { type: "match" }> | null
  >(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!matchId || !accessToken) return undefined;

    setStatut("connexion");
    setErreur(null);
    setCommentaires([]);
    setReactions(null);
    setConnectes(0);
    setMiseAJourMatch(null);

    const url = `${WS_BASE_URL}/live/${matchId}/?token=${encodeURIComponent(accessToken)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setStatut("ouvert");

    ws.onmessage = (event) => {
      let message: LiveMatchSocketMessage;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      switch (message.type) {
        case "commentaire":
          setCommentaires((precedents) => [...precedents, message]);
          break;
        case "reaction":
          setReactions(message.reactions);
          break;
        case "presence":
          setConnectes(message.connectes);
          break;
        case "match":
          setMiseAJourMatch(message);
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
  }, [matchId, accessToken]);

  const envoyerCommentaire = useCallback((contenu: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setErreur("Connexion au live perdue — veuillez réessayer dans un instant.");
      return;
    }
    setErreur(null);
    ws.send(JSON.stringify({ type: "commentaire", contenu }));
  }, []);

  const envoyerReaction = useCallback((emoji: TypeReactionMatch) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "reaction", emoji }));
  }, []);

  return {
    statut,
    commentaires,
    reactions,
    connectes,
    miseAJourMatch,
    erreur,
    envoyerCommentaire,
    envoyerReaction,
  };
}
