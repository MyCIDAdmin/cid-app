/** Hilfsfunktionen des Kalenders : Monatsraster (Woche beginnt am Montag), Gruppierung, Formate. */
import type { Kategorie, KalenderEintrag } from "../types/kalender";

const TAG_MS = 24 * 60 * 60 * 1000;

export function tagStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function tagSchluessel(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const t = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${t}`;
}

/** Erster angezeigte Tag (Montag der Woche des Monatsersten) und exklusives Ende (42 Tage). */
export function monatsRaster(monat: Date): { von: Date; bis: Date; tage: Date[] } {
  const erster = new Date(monat.getFullYear(), monat.getMonth(), 1);
  const versatz = (erster.getDay() + 6) % 7;
  const von = new Date(erster.getFullYear(), erster.getMonth(), 1 - versatz);
  const tage = Array.from(
    { length: 42 },
    (_, i) => new Date(von.getFullYear(), von.getMonth(), von.getDate() + i),
  );
  const bis = new Date(von.getFullYear(), von.getMonth(), von.getDate() + 42);
  return { von, bis, tage };
}

/** Verteilt Einträge auf alle Tage, die sie berühren (mehrtägige Termine erscheinen an jedem Tag). */
export function gruppiereNachTag(eintraege: KalenderEintrag[]): Map<string, KalenderEintrag[]> {
  const karte = new Map<string, KalenderEintrag[]>();
  for (const e of eintraege) {
    const start = tagStart(new Date(e.beginn));
    const ende = e.ende ? tagStart(new Date(e.ende)) : start;
    const tage = Math.min(Math.round((ende.getTime() - start.getTime()) / TAG_MS), 30);
    for (let i = 0; i <= tage; i++) {
      const tag = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const schluessel = tagSchluessel(tag);
      karte.set(schluessel, [...(karte.get(schluessel) ?? []), e]);
    }
  }
  for (const liste of karte.values()) {
    liste.sort((a, b) => a.beginn.localeCompare(b.beginn));
  }
  return karte;
}

export function formatZeit(
  e: Pick<KalenderEintrag, "beginn" | "ende" | "ganztaegig">,
  sprache: string,
) {
  const beginn = new Date(e.beginn);
  const tag = beginn.toLocaleDateString(sprache, {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  if (e.ganztaegig) return tag;
  const uhr = (d: Date) => d.toLocaleTimeString(sprache, { hour: "2-digit", minute: "2-digit" });
  const ende = e.ende ? new Date(e.ende) : null;
  if (!ende) return `${tag}, ${uhr(beginn)}`;
  const gleicherTag = tagSchluessel(beginn) === tagSchluessel(ende);
  return gleicherTag
    ? `${tag}, ${uhr(beginn)} – ${uhr(ende)}`
    : `${tag}, ${uhr(beginn)} – ${ende.toLocaleDateString(sprache)} ${uhr(ende)}`;
}

/** `datetime-local`-Wert (lokal) <-> ISO. */
export function zuLokalInput(iso: string | null | undefined, nurTag = false): string {
  if (!iso) return "";
  const d = new Date(iso);
  const tag = tagSchluessel(d);
  if (nurTag) return tag;
  const uhr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${tag}T${uhr}`;
}

export function vonLokalInput(wert: string): string | null {
  if (!wert) return null;
  return new Date(wert.length === 10 ? `${wert}T00:00` : wert).toISOString();
}

export const KATEGORIE_STIL: Record<Kategorie, string> = {
  sitzung: "bg-ca/15 text-ca",
  veranstaltung: "bg-status-successBg text-status-successText",
  frist: "bg-status-dangerBg text-status-dangerText",
  projekt: "bg-bg-tertiary text-text-primary",
  spieltag: "bg-cal text-cad",
  abwesenheit: "bg-bg-secondary text-text-tertiary",
  dienst: "bg-bg-tertiary text-text-secondary",
  vereinsdatum: "bg-ca text-white",
  sonstiges: "bg-bg-secondary text-text-secondary",
};
