/**
 * Hook WebSocket temps réel — module vote (SDD §2.3, apps.vote.consumers.VoteConsumer).
 *
 * {VITE_WS_BASE_URL}/votes/{session_id}/?token=<JWT> — authentification par
 * apps.accounts.ws_auth (JWT en query string, PAS de header). Le backend parle WebSocket brut
 * via Django Channels, PAS le protocole Socket.IO : bien que `socket.io-client` figure dans
 * package.json (prévu au départ pour un futur module communaute temps réel), il est
 * incompatible avec ce endpoint et n'est donc volontairement pas utilisé ici — ce hook s'appuie
 * sur l'API `WebSocket` native du navigateur.
 *
 * ATTENTION à la forme de `VITE_WS_BASE_URL` (docs/RAILWAY.md §6/§10.1) : la variable inclut
 * DÉJÀ le préfixe `/ws` (ex. `wss://<domaine-backend>/ws`), c'est pourquoi on n'ajoute ici que
 * `/votes/{id}/` — ajouter un second `/ws/` produirait `.../ws/ws/votes/{id}/`, une URL qui ne
 * correspond à aucune route de `config/ws_urls.py` (la connexion échoue silencieusement côté
 * navigateur : `onerror`/`onclose` sans jamais atteindre `onopen`, et `statut` reste bloqué hors
 * de "ouvert" indéfiniment — c'était le bug initial de ce hook).
 *
 * La soumission du bulletin (mockup #vote-submit-btn "Confirmer mon vote") passe exclusivement
 * par ce canal — jamais par un POST REST, afin que l'accusé de réception et la diffusion du
 * compteur de participation partagent le même point d'entrée (voir consumers.py docstring).
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuthStore } from "../store/authStore";
import type { ParticipationUpdate, Resultats, VoteSocketMessage } from "../types/vote";

const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL ?? "ws://localhost:8000/ws";

type StatutConnexion = "connexion" | "ouvert" | "ferme" | "erreur";

export interface UseVoteSocketResult {
  statut: StatutConnexion;
  participation: ParticipationUpdate | null;
  resultats: Resultats | null;
  erreur: string | null;
  voteEnregistre: boolean;
  voter: (choix: string[]) => void;
}

export function useVoteSocket(sessionId: string | undefined): UseVoteSocketResult {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [statut, setStatut] = useState<StatutConnexion>("connexion");
  const [participation, setParticipation] = useState<ParticipationUpdate | null>(null);
  const [resultats, setResultats] = useState<Resultats | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [voteEnregistre, setVoteEnregistre] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!sessionId || !accessToken) return undefined;

    setStatut("connexion");
    setErreur(null);
    setVoteEnregistre(false);

    const url = `${WS_BASE_URL}/votes/${sessionId}/?token=${encodeURIComponent(accessToken)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setStatut("ouvert");

    ws.onmessage = (event) => {
      let message: VoteSocketMessage;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      switch (message.type) {
        case "participation_update":
          setParticipation(message);
          break;
        case "resultats_disponibles":
          setResultats(message.resultats);
          break;
        case "erreur":
          setErreur(message.message);
          break;
        case "vote_enregistre":
          setVoteEnregistre(true);
          setErreur(null);
          break;
      }
    };

    ws.onerror = () => setStatut("erreur");
    ws.onclose = () => setStatut("ferme");

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [sessionId, accessToken]);

  const voter = useCallback((choix: string[]) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setErreur("Connexion au vote perdue — veuillez réessayer dans un instant.");
      return;
    }
    setErreur(null);
    ws.send(JSON.stringify({ type: "voter", choix }));
  }, []);

  return { statut, participation, resultats, erreur, voteEnregistre, voter };
}
