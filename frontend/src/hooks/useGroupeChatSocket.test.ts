/**
 * Même principe que useVoteSocket.test.ts / useMessagerieSocket.test.ts (voir leurs
 * docstrings) : jsdom ne fournit pas de vrai WebSocket, on remplace le constructeur global
 * par un faux client contrôlé.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "../store/authStore";
import { useGroupeChatSocket } from "./useGroupeChatSocket";

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

describe("useGroupeChatSocket", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    useAuthStore.setState({ accessToken: "jwt-token", refreshToken: "r", isAuthenticated: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("se connecte à l'URL ws/groupes/{id}/ avec le token en query string", () => {
    renderHook(() => useGroupeChatSocket("groupe-1"));
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].url).toContain("/ws/groupes/groupe-1/?token=jwt-token");
  });

  it("ne se connecte pas sans groupeId", () => {
    renderHook(() => useGroupeChatSocket(undefined));
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("accumule les messages reçus", async () => {
    const { result } = renderHook(() => useGroupeChatSocket("groupe-1"));
    const ws = FakeWebSocket.instances[0];

    act(() => {
      ws.ouvrir();
      ws.recevoir({
        type: "message",
        id: "m1",
        groupe: "groupe-1",
        auteur: { id: "u1", prenom: "Sana", nom: "Werfelli", photo: null },
        contenu: "Salut le groupe !",
        created_at: "2026-01-01T10:00:00Z",
      });
    });

    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(result.current.messages[0].contenu).toBe("Salut le groupe !");
  });

  it("envoie {type: 'message', contenu} au format attendu par le consumer", () => {
    const { result } = renderHook(() => useGroupeChatSocket("groupe-1"));
    const ws = FakeWebSocket.instances[0];
    act(() => ws.ouvrir());

    act(() => result.current.envoyer("Coucou tout le monde"));

    expect(ws.sent).toHaveLength(1);
    expect(JSON.parse(ws.sent[0])).toEqual({ type: "message", contenu: "Coucou tout le monde" });
  });

  it("expose un message d'erreur reçu du serveur", async () => {
    const { result } = renderHook(() => useGroupeChatSocket("groupe-1"));
    const ws = FakeWebSocket.instances[0];

    act(() => {
      ws.ouvrir();
      ws.recevoir({ type: "erreur", message: "Groupe introuvable." });
    });

    await waitFor(() => expect(result.current.erreur).toBe("Groupe introuvable."));
  });

  it("signale une erreur si l'on tente d'envoyer avant l'ouverture de la connexion", () => {
    const { result } = renderHook(() => useGroupeChatSocket("groupe-1"));
    act(() => result.current.envoyer("trop tôt"));
    expect(result.current.erreur).toMatch(/perdue/);
  });
});
