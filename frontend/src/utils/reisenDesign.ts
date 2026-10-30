/** Darstellung der Reisen : Titelbild je Ziel, Fortschritt zur Mindestzahl, „meine nächste Reise“. */
import type { ReiseDetail, ReiseListItem } from "../types/reisen";

/** Verlauf für das Titelbild ; derselbe Ort bekommt immer denselben Verlauf. */
const COVER = [
  "from-[#c2410c] via-[#9a3412] to-[#6a0609]",
  "from-[#0f766e] via-[#115e59] to-[#064e3b]",
  "from-[#2563eb] via-[#1d4ed8] to-[#1e3a8a]",
  "from-[#7c3aed] via-[#5b21b6] to-[#3b0764]",
] as const;

export function coverFuer(ort: string): string {
  let h = 0;
  for (const c of ort.trim().toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COVER[h % COVER.length];
}

/** Anteil (0–100) der bestätigten Teilnehmenden an der Mindestzahl ; null ohne Mindestzahl. */
export function fortschritt(dabei: number, min: number | null): number | null {
  if (!min || min <= 0) return null;
  return Math.min(100, Math.round((dabei / min) * 100));
}

const AKTIV = ["dabei", "interessiert", "angefragt"] as const;

/** Die nächste kommende Reise, an der die Person teilnimmt (zuerst „dabei“, dann „interessiert“). */
export function naechsteReise(
  liste: ReiseListItem[] | undefined,
  jetzt: number = Date.now(),
): ReiseListItem | undefined {
  const heute = new Date(jetzt).toISOString().slice(0, 10);
  const kommend = (liste ?? [])
    .filter(
      (r) => !r.abgesagt && r.mein_status && (AKTIV as readonly string[]).includes(r.mein_status),
    )
    .filter((r) => (r.ende ?? r.start ?? "9999-12-31") >= heute)
    .sort((a, b) => (a.start ?? "9999").localeCompare(b.start ?? "9999"));
  return kommend.find((r) => r.mein_status === "dabei") ?? kommend[0];
}

/** Die fünf Phasen einer Reise in ihrer Reihenfolge. */
export const PHASEN = ["interesse", "planung", "buchung", "reise", "rueckblick"] as const;

/** Zu welchem Reiter führt ein „Jetzt dran“-Punkt ? */
export const TAB_FUER_PUNKT: Record<string, string> = {
  abstimmen: "planung",
  aufgabe_ueberfaellig: "planung",
  info_lesen: "infos",
  hinreise: "meine",
  anfragen: "menschen",
};

/** Reiter, den der Hauptknopf je Phase öffnet. */
const PHASEN_TAB: Record<(typeof PHASEN)[number], string> = {
  interesse: "menschen",
  planung: "planung",
  buchung: "meine",
  reise: "infos",
  rueckblick: "infos",
};

export interface HauptZiel {
  tab: string;
  /** Der wichtigste offene Punkt („Jetzt dran“), falls es einen gibt ; sonst gilt der Phasenknopf. */
  punkt?: NonNullable<ReiseDetail["jetzt_dran"]>[number];
}

/**
 * Wohin führt der Hauptknopf einer Reise ? Zuerst der wichtigste offene Punkt, sonst der Reiter der
 * Phase. Ohne den passenden Reiter (z. B. noch nicht dabei) gibt es keinen Knopf.
 */
export function hauptZiel(reise: ReiseDetail, verfuegbareTabs: string[]): HauptZiel | null {
  const punkt = reise.jetzt_dran?.[0];
  const tab = punkt ? (TAB_FUER_PUNKT[punkt.art] ?? "blick") : PHASEN_TAB[reise.phase];
  return verfuegbareTabs.includes(tab) ? { tab, punkt } : null;
}
