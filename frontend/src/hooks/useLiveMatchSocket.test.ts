/**
 * Même principe que useGroupeChatSocket.test.ts / useMessagerieSocket.test.ts (voir leurs
 * docstrings) : jsdom ne fournit pas de vrai WebSocket, on remplace le constructeur global
 * par un faux client contrôlé.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "../store/authStore";
import { useLiveMatchSocket } from "./useLiveMatchSocket";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;

  url: string;
  readyState = FakeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  ouvrir() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  recevoir(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

describe("useLiveMatchSocket", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    useAuthStore.setState({ accessToken: "jwt-token", refreshToken: "r", isAuthenticated: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("se connecte à l'URL ws/live/{id}/ avec le token en query string", () => {
    renderHook(() => useLiveMatchSocket("match-1"));
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].url).toContain("/ws/live/match-1/?token=jwt-token");
  });

  it("ne se connecte pas sans matchId", () => {
    renderHook(() => useLiveMatchSocket(undefined));
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("accumule les commentaires reçus", async () => {
    const { result } = renderHook(() => useLiveMatchSocket("match-1"));
    const ws = FakeWebSocket.instances[0];

    act(() => {
      ws.ouvrir();
      ws.recevoir({
        type: "commentaire",
        id: "c1",
        match: "match-1",
        auteur: { id: "u1", prenom: "Sana", nom: "Werfelli", photo: null },
        contenu: "Allez CA !",
        created_at: "2026-01-01T10:00:00Z",
      });
    });

    await waitFor(() => expect(result.current.commentaires).toHaveLength(1));
    expect(result.current.commentaires[0].contenu).toBe("Allez CA !");
  });

  it("met à jour les réactions reçues", async () => {
    const { result } = renderHook(() => useLiveMatchSocket("match-1"));
    const ws = FakeWebSocket.instances[0];

    act(() => {
      ws.ouvrir();
      ws.recevoir({ type: "reaction", reactions: { coeur: 3, feu: 1, etoile: 0, surprise: 0 } });
    });

    await waitFor(() => expect(result.current.reactions?.coeur).toBe(3));
  });

  it("met à jour le nombre de connectés", async () => {
    const { result } = renderHook(() => useLiveMatchSocket("match-1"));
    const ws = FakeWebSocket.instances[0];

    act(() => {
      ws.ouvrir();
      ws.recevoir({ type: "presence", connectes: 42 });
    });

    await waitFor(() => expect(result.current.connectes).toBe(42));
  });

  it("expose la diffusion de mise à jour du match", async () => {
    const { result } = renderHook(() => useLiveMatchSocket("match-1"));
    const ws = FakeWebSocket.instances[0];

    act(() => {
      ws.ouvrir();
      ws.recevoir({
        type: "match",
        id: "match-1",
        statut: "en_cours",
        score_ca: 2,
        score_adversaire: 1,
        minute_chrono: 63,
      });
    });

    await waitFor(() => expect(result.current.miseAJourMatch?.score_ca).toBe(2));
  });

  // --- Fan-Club — journal d'événements du Live-Ticker (2026-09-24) ---

  it("accumule les événements de match (buts/cartons) reçus", async () => {
    const { result } = renderHook(() => useLiveMatchSocket("match-1"));
    const ws = FakeWebSocket.instances[0];

    act(() => {
      ws.ouvrir();
      ws.recevoir({
        type: "match_evenement",
        id: "e1",
        match: "match-1",
        type_evenement: "but",
        minute: 23,
        equipe: "ca",
        joueur: "Hamza Jelassi",
        description: "",
        created_by_nom: "Admin CID",
        created_at: "2026-01-01T10:23:00Z",
      });
    });

    await waitFor(() => expect(result.current.evenements).toHaveLength(1));
    expect(result.current.evenements[0].type_evenement).toBe("but");
    expect(result.current.evenements[0].joueur).toBe("Hamza Jelassi");
  });

  it("envoie {type: 'commentaire', contenu} au format attendu par le consumer", () => {
    const { result } = renderHook(() => useLiveMatchSocket("match-1"));
    const ws = FakeWebSocket.instances[0];
    act(() => ws.ouvrir());

    act(() => result.current.envoyerCommentaire("Quel match !"));

    expect(ws.sent).toHaveLength(1);
    expect(JSON.parse(ws.sent[0])).toEqual({ type: "commentaire", contenu: "Quel match !" });
  });

  it("envoie {type: 'reaction', emoji} au format attendu par le consumer", () => {
    const { result } = renderHook(() => useLiveMatchSocket("match-1"));
    const ws = FakeWebSocket.instances[0];
    act(() => ws.ouvrir());

    act(() => result.current.envoyerReaction("feu"));

    expect(ws.sent).toHaveLength(1);
    expect(JSON.parse(ws.sent[0])).toEqual({ type: "reaction", emoji: "feu" });
  });

  it("signale une erreur si l'on tente de commenter avant l'ouverture de la connexion", () => {
    const { result } = renderHook(() => useLiveMatchSocket("match-1"));
    act(() => result.current.envoyerCommentaire("trop tôt"));
    expect(result.current.erreur).toMatch(/perdue/);
  });
});
