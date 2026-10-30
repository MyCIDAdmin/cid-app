import { describe, expect, it } from "vitest";

import type { ChatListItem, ChatNachricht } from "../types/chats";
import {
  filtereChats,
  initialen,
  kurzDatum,
  listenZeit,
  nachTagen,
  neuAbId,
  sortiereChats,
  tagArt,
} from "./chatsDesign";

const JETZT = new Date(2026, 9, 30, 15, 0).getTime();

function chat(o: Partial<ChatListItem>): ChatListItem {
  return {
    art: "direkt",
    id: "c",
    name: "Lina",
    partner: null,
    online: null,
    privat: null,
    anzahl_mitglieder: 2,
    reise: null,
    nicht_gelesen: 0,
    stumm: false,
    angeheftet: false,
    letzte: null,
    aktivitaet: "2026-10-30T10:00:00Z",
    ...o,
  };
}

function nachricht(o: Partial<ChatNachricht>): ChatNachricht {
  return {
    id: "n",
    art: "text",
    text: "x",
    daten: null,
    vonId: "u",
    vonName: "U",
    ich: false,
    zeit: new Date(2026, 9, 30, 12, 0).toISOString(),
    likes: 0,
    jaime: false,
    reaktionen: [],
    angeheftet: false,
    antwort: null,
    umfrage: null,
    gelesen: false,
    ...o,
  };
}

describe("chatsDesign", () => {
  it("tagArt unterscheidet heute, gestern und früher", () => {
    expect(tagArt(new Date(2026, 9, 30, 1, 0).toISOString(), JETZT)).toBe("heute");
    expect(tagArt(new Date(2026, 9, 29, 23, 0).toISOString(), JETZT)).toBe("gestern");
    expect(tagArt(new Date(2026, 9, 20, 12, 0).toISOString(), JETZT)).toBe("datum");
  });

  it("listenZeit zeigt heute die Uhrzeit, sonst das Datum", () => {
    const heute = new Date(2026, 9, 30, 9, 5).toISOString();
    const frueher = new Date(2026, 9, 12, 9, 5).toISOString();
    expect(listenZeit(heute, "de", JETZT)).toMatch(/09:05/);
    expect(listenZeit(frueher, "de", JETZT)).toBe(kurzDatum(frueher, "de"));
  });

  it("nachTagen gruppiert aufsteigende Nachrichten nach Kalendertag", () => {
    const liste = [
      nachricht({ id: "a", zeit: new Date(2026, 9, 29, 9, 0).toISOString() }),
      nachricht({ id: "b", zeit: new Date(2026, 9, 29, 18, 0).toISOString() }),
      nachricht({ id: "c", zeit: new Date(2026, 9, 30, 8, 0).toISOString() }),
    ];
    const g = nachTagen(liste);
    expect(g.map((x) => x.nachrichten.map((n) => n.id))).toEqual([["a", "b"], ["c"]]);
  });

  it("neuAbId nimmt die älteste der letzten fremden Nachrichten", () => {
    const liste = [
      nachricht({ id: "a" }),
      nachricht({ id: "b", ich: true }),
      nachricht({ id: "c" }),
      nachricht({ id: "s", art: "system" }),
      nachricht({ id: "d" }),
    ];
    expect(neuAbId(liste, 2)).toBe("c");
    expect(neuAbId(liste, 10)).toBe("a");
    expect(neuAbId(liste, 0)).toBeNull();
    expect(neuAbId([], 3)).toBeNull();
  });

  it("filtereChats kombiniert Filter und Suche", () => {
    const liste = [
      chat({ id: "1", name: "Lina", nicht_gelesen: 2 }),
      chat({ id: "2", art: "gruppe", name: "Berlin Fans" }),
      chat({ id: "3", art: "reise", name: "Tunis 2027" }),
    ];
    expect(filtereChats(liste, "ungelesen", "").map((c) => c.id)).toEqual(["1"]);
    expect(filtereChats(liste, "gruppen", "").map((c) => c.id)).toEqual(["2"]);
    expect(filtereChats(liste, "reisen", "").map((c) => c.id)).toEqual(["3"]);
    expect(filtereChats(liste, "alle", "berlin").map((c) => c.id)).toEqual(["2"]);
  });

  it("sortiereChats stellt Angeheftete vor, sonst neueste Aktivität zuerst", () => {
    const liste = [
      chat({ id: "alt", aktivitaet: "2026-10-01T10:00:00Z" }),
      chat({ id: "neu", aktivitaet: "2026-10-29T10:00:00Z" }),
      chat({ id: "pin", aktivitaet: "2026-09-01T10:00:00Z", angeheftet: true }),
    ];
    expect(sortiereChats(liste).map((c) => c.id)).toEqual(["pin", "neu", "alt"]);
  });

  it("initialen nimmt Vor- und Nachnamen", () => {
    expect(initialen("lina khemiri")).toBe("LK");
    expect(initialen("Berlin")).toBe("B");
  });
});
