/**
 * jsdom ne fournit pas de WebSocket réel connecté à un serveur — ce test remplace le
 * constructeur global par un faux client entièrement contrôlé, pour vérifier le contrat du
 * hook (URL construite avec le token, dispatch par `type` de message, envoi du bulletin) sans
 * dépendre d'un vrai apps.vote.consumers.VoteConsumer.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "../store/authStore";
import { useVoteSocket } from "./useVoteSocket";

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

  // --- helpers de test ---
  ouvrir() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  recevoir(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

describe("useVoteSocket", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    useAuthStore.setState({ accessToken: "jwt-token", refreshToken: "r", isAuthenticated: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("se connecte à l'URL ws/votes/{id}/ avec le token en query string", () => {
    renderHook(() => useVoteSocket("session-1"));
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].url).toContain("/ws/votes/session-1/?token=jwt-token");
  });

  it("ne se connecte pas sans sessionId", () => {
    renderHook(() => useVoteSocket(undefined));
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("expose participation_update reçu du serveur", async () => {
    const { result } = renderHook(() => useVoteSocket("session-1"));
    const ws = FakeWebSocket.instances[0];

    act(() => {
      ws.ouvrir();
      ws.recevoir({
        type: "participation_update",
        session_id: "session-1",
        total_participants: 12,
        total_eligibles: 100,
        pct: 12.0,
        temps_restant_secondes: 900,
      });
    });

    await waitFor(() => expect(result.current.participation?.total_participants).toBe(12));
  });

  it("passe à voteEnregistre=true à la réception de vote_enregistre", async () => {
    const { result } = renderHook(() => useVoteSocket("session-1"));
    const ws = FakeWebSocket.instances[0];

    act(() => {
      ws.ouvrir();
      ws.recevoir({ type: "vote_enregistre" });
    });

    await waitFor(() => expect(result.current.voteEnregistre).toBe(true));
  });

  it("expose un message d'erreur (ex : double vote)", async () => {
    const { result } = renderHook(() => useVoteSocket("session-1"));
    const ws = FakeWebSocket.instances[0];

    act(() => {
      ws.ouvrir();
      ws.recevoir({ type: "erreur", message: "Vous avez déjà voté pour cette session." });
    });

    await waitFor(() =>
      expect(result.current.erreur).toBe("Vous avez déjà voté pour cette session."),
    );
  });

  it("envoie {type: 'voter', choix} au format attendu par le consumer", () => {
    const { result } = renderHook(() => useVoteSocket("session-1"));
    const ws = FakeWebSocket.instances[0];
    act(() => ws.ouvrir());

    act(() => result.current.voter(["opt-1", "opt-2"]));

    expect(ws.sent).toHaveLength(1);
    expect(JSON.parse(ws.sent[0])).toEqual({ type: "voter", choix: ["opt-1", "opt-2"] });
  });

  it("signale une erreur si l'on tente de voter avant l'ouverture de la connexion", () => {
    const { result } = renderHook(() => useVoteSocket("session-1"));
    act(() => result.current.voter(["opt-1"]));
    expect(result.current.erreur).toMatch(/perdue/);
  });
});
