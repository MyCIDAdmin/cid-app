import { act, cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../../api/reisen";
import { reise } from "../../test/reisenDaten";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { Umfeld } from "../../types/reisen";
import { ortszeit, wetterArt, zeitUnterschied } from "../../utils/umfeld";
import AmZiel from "./AmZiel";

vi.mock("../../api/reisen");

const umfeld: Umfeld = {
  verfuegbar: true,
  ort: "Kairo",
  land: "Ägypten",
  zeitzone: "Africa/Cairo",
  wetter: {
    jetzt: { temp: 27, code: 0, tag: true },
    tage: [
      { datum: "2026-11-26", code: 0, max: 26, min: 17 },
      { datum: "2026-11-27", code: 61, max: 22, min: 15 },
      { datum: "2026-11-28", code: 95, max: 21, min: 14 },
    ],
    vorhersage_ab: null,
  },
  kurs: { code: "EGP", kurs: 62.48, stand: "29 Oct 2026" },
  sicherheit: "https://www.auswaertiges-amt.de/de/service/laender",
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(new Date("2026-11-26T11:30:00Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

async function zeige(daten: Umfeld) {
  vi.mocked(api.getUmfeld).mockResolvedValue(daten);
  renderWithProviders(<AmZiel reise={reise()} />);
  await waitFor(() => expect(api.getUmfeld).toHaveBeenCalled());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}

describe("Karte „Am Reiseziel“", () => {
  it("zeigt zwei Uhren mit dem Zeitunterschied zu Berlin", async () => {
    await zeige(umfeld);
    expect(screen.getByTestId("uhr-umfeld.berlin")).toHaveTextContent("12:30");
    expect(screen.getByTestId("uhr-Kairo")).toHaveTextContent("13:30");
    expect(screen.getByText(/umfeld\.unterschied/)).toBeInTheDocument();
  });

  it("zeigt Wetter jetzt und je Reisetag mit Symbolen sowie den Kurs", async () => {
    await zeige(umfeld);
    expect(screen.getByTestId("wetter-jetzt")).toHaveTextContent("27°");
    const tage = screen.getByTestId("wetter-tage");
    expect(tage.querySelectorAll("li")).toHaveLength(3);
    expect(screen.getByTestId("wetter-regen")).toBeInTheDocument();
    expect(screen.getByTestId("wetter-gewitter")).toBeInTheDocument();
    expect(screen.getByTestId("kurs")).toHaveTextContent("EGP");
    expect(screen.getByRole("link", { name: "umfeld.sicherheit" })).toHaveAttribute(
      "href",
      "https://www.auswaertiges-amt.de/de/service/laender",
    );
  });

  it("lässt fehlende Blöcke weg, statt Fehler zu zeigen", async () => {
    await zeige({ ...umfeld, wetter: null, kurs: null });
    expect(screen.queryByTestId("wetter-jetzt")).not.toBeInTheDocument();
    expect(screen.queryByTestId("kurs")).not.toBeInTheDocument();
    expect(screen.getByTestId("uhr-Kairo")).toBeInTheDocument();
  });

  it("nennt den Beginn der Vorhersage, wenn die Reise zu weit weg ist", async () => {
    await zeige({
      ...umfeld,
      wetter: { jetzt: umfeld.wetter!.jetzt, tage: [], vorhersage_ab: "2026-11-11" },
    });
    expect(screen.getByText(/umfeld\.vorhersage_ab/)).toBeInTheDocument();
    expect(screen.queryByTestId("wetter-tage")).not.toBeInTheDocument();
  });

  it("zeigt nichts, wenn der Zielort nicht aufgelöst werden konnte", async () => {
    await zeige({ verfuegbar: false });
    expect(screen.queryByTestId("am-ziel")).not.toBeInTheDocument();
  });

  it("zeigt Nachts ein Mondsymbol statt der Sonne", async () => {
    await zeige({
      ...umfeld,
      wetter: { ...umfeld.wetter!, jetzt: { temp: 12, code: 0, tag: false } },
    });
    expect(screen.getByTestId("wetter-jetzt")).toHaveTextContent("12°");
  });
});

describe("Hilfen für Uhr und Wetter", () => {
  it("ordnet WMO-Codes den Darstellungen zu", () => {
    expect(wetterArt(0)).toBe("sonne");
    expect(wetterArt(2)).toBe("teilweise");
    expect(wetterArt(3)).toBe("wolken");
    expect(wetterArt(45)).toBe("nebel");
    expect(wetterArt(63)).toBe("regen");
    expect(wetterArt(81)).toBe("regen");
    expect(wetterArt(73)).toBe("schnee");
    expect(wetterArt(99)).toBe("gewitter");
    expect(wetterArt(null)).toBe("wolken");
  });

  it("rechnet Ortszeit und Zeitunterschied, auch bei halben Stunden", () => {
    const winter = new Date("2026-11-26T11:30:00Z");
    expect(ortszeit("Europe/Berlin", winter)?.text).toBe("12:30");
    expect(ortszeit("Kein/Ort", winter)).toBeNull();
    expect(zeitUnterschied("Africa/Tunis", winter)).toBe(0);
    expect(zeitUnterschied("Africa/Cairo", winter)).toBe(1);
    expect(zeitUnterschied("Asia/Kolkata", winter)).toBe(4.5);
    expect(zeitUnterschied("Kein/Ort", winter)).toBeNull();
  });
});
