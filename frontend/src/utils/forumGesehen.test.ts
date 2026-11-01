import { beforeEach, describe, expect, it } from "vitest";

import {
  forumGesehen,
  forumGrundlinie,
  istForumThemaNeu,
  markiereForumThemaGesehen,
} from "./forumGesehen";

describe("forumGesehen", () => {
  beforeEach(() => window.localStorage.clear());

  it("setzt die Grundlinie beim ersten Aufruf und behält sie danach", () => {
    const erste = forumGrundlinie("u1");
    expect(erste).toBeGreaterThan(0);
    expect(forumGrundlinie("u1")).toBe(erste);
  });

  it("trennt die Daten je Konto", () => {
    markiereForumThemaGesehen("u1", "s1");
    expect(Object.keys(forumGesehen("u1"))).toEqual(["s1"]);
    expect(forumGesehen("u2")).toEqual({});
  });

  it("ein Thema ist neu, wenn die Aktivität nach dem letzten Ansehen (oder der Grundlinie) liegt", () => {
    const grund = new Date("2026-11-01T10:00:00Z").getTime();
    expect(istForumThemaNeu("2026-11-01T09:00:00Z", "s1", {}, grund)).toBe(false);
    expect(istForumThemaNeu("2026-11-01T11:00:00Z", "s1", {}, grund)).toBe(true);
    expect(
      istForumThemaNeu("2026-11-01T11:00:00Z", "s1", { s1: grund + 3 * 3600_000 }, grund),
    ).toBe(false);
  });

  it("begrenzt die Liste der gesehenen Themen", () => {
    for (let i = 0; i < 210; i += 1) markiereForumThemaGesehen("u1", `s${i}`);
    expect(Object.keys(forumGesehen("u1")).length).toBe(200);
  });

  it("übersteht einen gesperrten Speicher", () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("gesperrt");
    };
    try {
      expect(() => markiereForumThemaGesehen("u1", "s1")).not.toThrow();
      expect(() => forumGrundlinie("u1")).not.toThrow();
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
