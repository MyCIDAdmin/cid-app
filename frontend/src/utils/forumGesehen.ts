/**
 * „Neu für dich“ im Forum : welche Themen dieses Gerät schon gesehen hat. Alles bleibt im Browser
 * (localStorage), nichts geht an den Server – daher gilt der Punkt nur pro Gerät.
 *
 * Grundlinie : beim allerersten Öffnen wird „jetzt“ gemerkt ; ältere Aktivität zählt dann nicht
 * als neu (sonst wäre beim ersten Besuch jedes Thema „neu“).
 */

function schluessel(userId: string | undefined, teil: string): string {
  return `forum:${teil}:${userId ?? "anonym"}`;
}

function lesen<T>(key: string, vorgabe: T): T {
  try {
    const roh = window.localStorage.getItem(key);
    return roh ? (JSON.parse(roh) as T) : vorgabe;
  } catch {
    return vorgabe;
  }
}

function schreiben(key: string, wert: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(wert));
  } catch {
    /* Speicher gesperrt : dann gibt es keine Punkte, die Seite funktioniert trotzdem. */
  }
}

/** Zeitpunkt des ersten Besuchs (wird beim ersten Aufruf gesetzt). */
export function forumGrundlinie(userId: string | undefined): number {
  const key = schluessel(userId, "basis");
  const vorhanden = lesen<number>(key, 0);
  if (vorhanden) return vorhanden;
  const jetzt = Date.now();
  schreiben(key, jetzt);
  return jetzt;
}

export function forumGesehen(userId: string | undefined): Record<string, number> {
  return lesen<Record<string, number>>(schluessel(userId, "gesehen"), {});
}

export function markiereForumThemaGesehen(userId: string | undefined, sujetId: string): void {
  const key = schluessel(userId, "gesehen");
  const karte = lesen<Record<string, number>>(key, {});
  karte[sujetId] = Date.now();
  // Begrenzen, damit der Speicher nicht endlos wächst : die 200 jüngsten Einträge genügen.
  const eintraege = Object.entries(karte)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 200);
  schreiben(key, Object.fromEntries(eintraege));
}

export function istForumThemaNeu(
  letzteAktivitaetIso: string,
  sujetId: string,
  gesehen: Record<string, number>,
  grundlinie: number,
): boolean {
  const seit = gesehen[sujetId] ?? grundlinie;
  return new Date(letzteAktivitaetIso).getTime() > seit;
}
