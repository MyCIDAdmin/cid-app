/**
 * Prüft public/sw.js, ohne einen Browser: die Datei wird mit einem Attrappen-`self` ausgeführt.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import QUELLE from "../public/sw.js?raw";

type Listener = (event: Record<string, unknown>) => void;

function laden() {
  const listener: Record<string, Listener> = {};
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const matchAll = vi.fn().mockResolvedValue([]);
  const self = {
    addEventListener: (name: string, fn: Listener) => {
      listener[name] = fn;
    },
    registration: { showNotification },
    clients: { openWindow, matchAll, claim: vi.fn() },
    location: { origin: "https://www.my-cid.de" },
    skipWaiting: vi.fn(),
  };
  new Function("self", QUELLE)(self);
  return { listener, showNotification, openWindow, matchAll };
}

function pushEreignis(daten: unknown) {
  const warten: Promise<unknown>[] = [];
  return {
    ereignis: {
      data: { json: () => daten },
      waitUntil: (p: Promise<unknown>) => warten.push(p),
    },
    warten,
  };
}

function klick(link: unknown) {
  const warten: Promise<unknown>[] = [];
  const close = vi.fn();
  return {
    ereignis: {
      notification: { close, data: { link } },
      waitUntil: (p: Promise<unknown>) => warten.push(p),
    },
    warten,
    close,
  };
}

describe("sw.js", () => {
  let sw: ReturnType<typeof laden>;
  beforeEach(() => {
    sw = laden();
  });

  it("hat nur Push-Handler, keinen fetch-Handler (kein Offline-Cache)", () => {
    expect(Object.keys(sw.listener).sort()).toEqual([
      "activate",
      "install",
      "notificationclick",
      "push",
    ]);
  });

  it("zeigt Titel als Text und merkt sich den Link", async () => {
    const { ereignis, warten } = pushEreignis({
      titel: "Neue Antwort auf dein Ticket",
      link: "/support/42",
      tag: "n-7",
      sprache: "de",
    });
    sw.listener.push(ereignis);
    await Promise.all(warten);
    const [kopf, opt] = sw.showNotification.mock.calls[0];
    expect(kopf).toBe("Clubistes in Deutschland");
    expect(opt.body).toBe("Neue Antwort auf dein Ticket");
    expect(opt.tag).toBe("n-7");
    expect(opt.data).toEqual({ link: "/support/42" });
  });

  it("fremde Links werden zur Startseite", async () => {
    for (const link of ["https://evil.example/x", "//evil.example", "javascript:alert(1)", 5]) {
      sw.showNotification.mockClear();
      const { ereignis, warten } = pushEreignis({ titel: "x", link });
      sw.listener.push(ereignis);
      await Promise.all(warten);
      expect(sw.showNotification.mock.calls[0][1].data.link).toBe("/");
    }
  });

  it("kaputte Nutzlast zeigt trotzdem eine neutrale Meldung", async () => {
    const warten: Promise<unknown>[] = [];
    sw.listener.push({
      data: {
        json: () => {
          throw new Error("kein JSON");
        },
      },
      waitUntil: (p: Promise<unknown>) => warten.push(p),
    });
    await Promise.all(warten);
    expect(sw.showNotification.mock.calls[0][1].body).toBe("Neue Benachrichtigung");
  });

  it("Tippen ohne offenes Fenster öffnet den Link", async () => {
    const { ereignis, warten, close } = klick("/chats/gruppe/1");
    sw.listener.notificationclick(ereignis);
    await Promise.all(warten);
    expect(close).toHaveBeenCalled();
    expect(sw.openWindow).toHaveBeenCalledWith("https://www.my-cid.de/chats/gruppe/1");
  });

  it("Tippen mit offenem App-Fenster holt es nach vorn und navigiert", async () => {
    const fenster = {
      url: "https://www.my-cid.de/dashboard",
      focus: vi.fn().mockResolvedValue(undefined),
      navigate: vi.fn().mockResolvedValue(undefined),
    };
    sw.matchAll.mockResolvedValue([{ url: "https://andere.example/", focus: vi.fn() }, fenster]);
    const { ereignis, warten } = klick("/support/42");
    sw.listener.notificationclick(ereignis);
    await Promise.all(warten);
    expect(fenster.focus).toHaveBeenCalled();
    expect(fenster.navigate).toHaveBeenCalledWith("https://www.my-cid.de/support/42");
    expect(sw.openWindow).not.toHaveBeenCalled();
  });

  it("manipulierter Link beim Tippen führt nie aus der App heraus", async () => {
    const { ereignis, warten } = klick("https://evil.example/");
    sw.listener.notificationclick(ereignis);
    await Promise.all(warten);
    expect(sw.openWindow).toHaveBeenCalledWith("https://www.my-cid.de/");
  });
});
