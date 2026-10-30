/** Wie useVoteSocket.test.ts : jsdom hat keinen echten WebSocket, ein Fake prüft den Vertrag. */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "../store/authStore";
import { useChatSocket } from "./useChatSocket";

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
  oeffnen() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }
  empfangen(m: unknown) {
    this.onmessage?.({ data: JSON.stringify(m) });
  }
}

describe("useChatSocket", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    useAuthStore.setState({ accessToken: "jwt", refreshToken: "r", isAuthenticated: true });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("verbindet Direktchats mit /messagerie/{id}/ und Gruppen mit /groupes/{id}/", () => {
    renderHook(() => useChatSocket("direkt", "c1"));
    renderHook(() => useChatSocket("gruppe", "g1"));
    expect(FakeWebSocket.instances[0].url).toContain("/messagerie/c1/?token=jwt");
    expect(FakeWebSocket.instances[1].url).toContain("/groupes/g1/?token=jwt");
  });

  it("verbindet nicht ohne Chat", () => {
    renderHook(() => useChatSocket(undefined, undefined));
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("sammelt Nachrichten und entfernt gelöschte", () => {
    const { result } = renderHook(() => useChatSocket("gruppe", "g1"));
    const ws = FakeWebSocket.instances[0];
    act(() => {
      ws.oeffnen();
      ws.empfangen({ type: "message", id: "m1", contenu: "Hallo", art: "text" });
      ws.empfangen({ type: "message", id: "m2", contenu: "Zwei", art: "text" });
    });
    expect(result.current.statut).toBe("ouvert");
    expect(result.current.messages.map((m) => m.id)).toEqual(["m1", "m2"]);
    act(() => ws.empfangen({ type: "message_supprime", id: "m1" }));
    expect(result.current.messages.map((m) => m.id)).toEqual(["m2"]);
    expect(result.current.ereignisse.geloescht).toEqual(["m1"]);
  });

  it("leitet Reaktionen, Anheften, Umfrage-Stimmen und Lesebestätigung weiter", () => {
    const { result } = renderHook(() => useChatSocket("gruppe", "g1"));
    const ws = FakeWebSocket.instances[0];
    act(() => {
      ws.oeffnen();
      ws.empfangen({
        type: "message_reaktion",
        id: "m1",
        emoji: "👍",
        anzahl: 2,
        membre_id: "u",
        aktiv: true,
      });
      ws.empfangen({ type: "message_angeheftet", id: "m1", angeheftet: true });
      ws.empfangen({ type: "umfrage_update", id: "m1", zaehler: [1, 2], gesamt: 3 });
      ws.empfangen({ type: "lu", conversation: "c", lu_par: "u2" });
    });
    const e = result.current.ereignisse;
    expect(e.reaktionen[0]).toMatchObject({ emoji: "👍", anzahl: 2 });
    expect(e.pins[0]).toMatchObject({ id: "m1", angeheftet: true });
    expect(e.umfragen[0].gesamt).toBe(3);
    expect(e.gelesenVon).toEqual(["u2"]);
  });

  it("zeigt Tippende kurz an und entfernt sie wieder", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useChatSocket("gruppe", "g1"));
    const ws = FakeWebSocket.instances[0];
    act(() => {
      ws.oeffnen();
      ws.empfangen({ type: "tippt", membre_id: "u2" });
    });
    expect(result.current.tippende).toEqual(["u2"]);
    act(() => {
      vi.advanceTimersByTime(4100);
    });
    expect(result.current.tippende).toEqual([]);
  });

  it("sendet Nachrichten mit Art und Daten, das Tippsignal nur gedrosselt", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-30T10:00:00Z"));
    const { result } = renderHook(() => useChatSocket("gruppe", "g1"));
    const ws = FakeWebSocket.instances[0];
    act(() => ws.oeffnen());
    act(() =>
      result.current.envoyer({
        contenu: "",
        art: "treffpunkt",
        daten: { ort: "Hauptbahnhof", zeit: "18:00", link: "" },
        repondA: "m0",
      }),
    );
    expect(JSON.parse(ws.sent[0])).toEqual({
      type: "message",
      contenu: "",
      art: "treffpunkt",
      daten: { ort: "Hauptbahnhof", zeit: "18:00", link: "" },
      repond_a: "m0",
    });
    act(() => {
      result.current.tippSignal();
      result.current.tippSignal();
    });
    expect(ws.sent.filter((s) => JSON.parse(s).type === "tippt")).toHaveLength(1);
    act(() => result.current.marquerLu());
    expect(JSON.parse(ws.sent[ws.sent.length - 1])).toEqual({ type: "lu" });
  });

  it("meldet einen Fehler, wenn die Verbindung nicht offen ist", () => {
    const { result } = renderHook(() => useChatSocket("direkt", "c1"));
    act(() => result.current.envoyer({ contenu: "Hi" }));
    expect(result.current.erreur).toBeTruthy();
  });
});
