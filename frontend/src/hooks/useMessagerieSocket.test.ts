/**
 * Même principe que useVoteSocket.test.ts (voir son docstring) : jsdom ne fournit pas de
 * vrai WebSocket, on remplace le constructeur global par un faux client contrôlé pour
 * vérifier le contrat du hook (URL, dispatch par type, envoi du message/marquage lu).
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "../store/authStore";
import { useMessagerieSocket } from "./useMessagerieSocket";

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

describe("useMessagerieSocket", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    useAuthStore.setState({ accessToken: "jwt-token", refreshToken: "r", isAuthenticated: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("se connecte à l'URL ws/messagerie/{id}/ avec le token en query string", () => {
    renderHook(() => useMessagerieSocket("conv-1"));
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].url).toContain("/ws/messagerie/conv-1/?token=jwt-token");
  });

  it("ne se connecte pas sans conversationId", () => {
    renderHook(() => useMessagerieSocket(undefined));
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("accumule les messages reçus", async () => {
    const { result } = renderHook(() => useMessagerieSocket("conv-1"));
    const ws = FakeWebSocket.instances[0];

    act(() => {
      ws.ouvrir();
      ws.recevoir({
        type: "message",
        id: "m1",
        conversation: "conv-1",
        expediteur: "u1",
        contenu: "Salut !",
        est_lu: false,
        created_at: "2026-01-01T10:00:00Z",
      });
    });

    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(result.current.messages[0].contenu).toBe("Salut !");
  });

  it("retire un message supprimé de 'messages' et l'ajoute à 'messagesSupprimesIds' (demande utilisateur du 2026-09-16)", async () => {
    const { result } = renderHook(() => useMessagerieSocket("conv-1"));
    const ws = FakeWebSocket.instances[0];

    act(() => {
      ws.ouvrir();
      ws.recevoir({
        type: "message",
        id: "m1",
        conversation: "conv-1",
        expediteur: "u1",
        contenu: "Oups",
        est_lu: false,
        created_at: "2026-01-01T10:00:00Z",
      });
    });
    await waitFor(() => expect(result.current.messages).toHaveLength(1));

    act(() => ws.recevoir({ type: "message_supprime", id: "m1" }));

    await waitFor(() => expect(result.current.messages).toHaveLength(0));
    expect(result.current.messagesSupprimesIds).toEqual(["m1"]);
  });

  it("envoie {type: 'message', contenu} au format attendu par le consumer", () => {
    const { result } = renderHook(() => useMessagerieSocket("conv-1"));
    const ws = FakeWebSocket.instances[0];
    act(() => ws.ouvrir());

    act(() => result.current.envoyer("Coucou"));

    expect(ws.sent).toHaveLength(1);
    expect(JSON.parse(ws.sent[0])).toEqual({ type: "message", contenu: "Coucou" });
  });

  it("marquerLu envoie {type: 'lu'}", () => {
    const { result } = renderHook(() => useMessagerieSocket("conv-1"));
    const ws = FakeWebSocket.instances[0];
    act(() => ws.ouvrir());

    act(() => result.current.marquerLu());

    expect(JSON.parse(ws.sent[0])).toEqual({ type: "lu" });
  });

  it("expose un message d'erreur reçu du serveur", async () => {
    const { result } = renderHook(() => useMessagerieSocket("conv-1"));
    const ws = FakeWebSocket.instances[0];

    act(() => {
      ws.ouvrir();
      ws.recevoir({ type: "erreur", message: "Vous n'êtes pas participant de cette conversation." });
    });

    await waitFor(() =>
      expect(result.current.erreur).toBe("Vous n'êtes pas participant de cette conversation."),
    );
  });

  it("signale une erreur si l'on tente d'envoyer avant l'ouverture de la connexion", () => {
    const { result } = renderHook(() => useMessagerieSocket("conv-1"));
    act(() => result.current.envoyer("trop tôt"));
    expect(result.current.erreur).toMatch(/perdue/);
  });
});
