/** Hilfen für die Übersicht : nächstes Spiel, Countdown, Begrüßung und die Liste „Heute für dich“. */
import type { RencontreCalendrier } from "../types/communaute";

const MS_TAG = 86_400_000;

/** Das nächste noch nicht gespielte, nicht abgesagte Spiel (Heim oder Auswärts). */
export function naechstesSpiel(
  spiele: RencontreCalendrier[] | undefined,
  jetzt: number = Date.now(),
): RencontreCalendrier | undefined {
  return (spiele ?? [])
    .filter((s) => s.statut === "SCHEDULED" && new Date(s.date_heure).getTime() > jetzt)
    .sort((a, b) => new Date(a.date_heure).getTime() - new Date(b.date_heure).getTime())[0];
}

export interface RestZeit {
  tage: number;
  stunden: number;
  minuten: number;
  sekunden: number;
  vorbei: boolean;
}

export function restZeit(ziel: string | number | Date, jetzt: number): RestZeit {
  const ms = new Date(ziel).getTime() - jetzt;
  if (!Number.isFinite(ms) || ms <= 0) {
    return { tage: 0, stunden: 0, minuten: 0, sekunden: 0, vorbei: true };
  }
  let rest = Math.floor(ms / 1000);
  const tage = Math.floor(rest / 86400);
  rest -= tage * 86400;
  const stunden = Math.floor(rest / 3600);
  rest -= stunden * 3600;
  const minuten = Math.floor(rest / 60);
  return { tage, stunden, minuten, sekunden: rest - minuten * 60, vorbei: false };
}

export type Tageszeit = "morgen" | "tag" | "abend";

export function tageszeit(jetzt: Date = new Date()): Tageszeit {
  const h = jetzt.getHours();
  return h < 11 ? "morgen" : h < 18 ? "tag" : "abend";
}

/** Gegner und Ort aus Sicht von Club Africain. */
export function istHeimspiel(spiel: RencontreCalendrier): boolean {
  return spiel.equipe_domicile.toLowerCase().includes("africain");
}

export function gegnerName(spiel: RencontreCalendrier): string {
  return istHeimspiel(spiel) ? spiel.equipe_exterieur : spiel.equipe_domicile;
}

export type AufgabeArt = "abstimmung" | "reise" | "beitrag" | "tipp" | "anmeldung";
export type AufgabeFarbe = "red" | "amber" | "blue" | "green";

export interface Aufgabe {
  id: string;
  art: AufgabeArt;
  farbe: AufgabeFarbe;
  /** Übersetzungsschlüssel unter `uebersicht.aufgaben.*` und Werte dafür. */
  schluessel: string;
  werte?: Record<string, string | number>;
  link: string;
}

export interface AufgabenQuellen {
  /** Offene Abstimmungssitzungen. */
  abstimmungen?: { id: string; titel: string }[];
  /** Beitrag des laufenden Jahres : undefined = keine Zeile, sonst Status. */
  beitrag?: { status: string; betrag: string } | null;
  beitragLink?: string;
  /** Anmeldungen, die auf die Zahlung warten. */
  anmeldungen?: { id: string; titel: string; betrag: string }[];
  /** Nächstes Spiel mit einer sichtbaren Reise, bei der ich noch keinen Status habe. */
  reiseOffen?: { id: string; titel: string } | null;
  /** Tippspiel : ich nehme teil, zum nächsten Spiel fehlt mein Tipp und die Frist läuft noch. */
  tippFehlt?: { spiel: string; link: string } | null;
}

/** Baut die Liste „Heute für dich“. Die Reihenfolge ist die der Dringlichkeit. */
export function baueAufgaben(q: AufgabenQuellen): Aufgabe[] {
  const liste: Aufgabe[] = [];
  for (const a of q.abstimmungen ?? []) {
    liste.push({
      id: `abstimmung:${a.id}`,
      art: "abstimmung",
      farbe: "red",
      schluessel: "abstimmung",
      werte: { titel: a.titel },
      link: "/votes",
    });
  }
  if (q.tippFehlt) {
    liste.push({
      id: `tipp:${q.tippFehlt.spiel}`,
      art: "tipp",
      farbe: "green",
      schluessel: "tipp",
      werte: { spiel: q.tippFehlt.spiel },
      link: q.tippFehlt.link,
    });
  }
  if (q.reiseOffen) {
    liste.push({
      id: `reise:${q.reiseOffen.id}`,
      art: "reise",
      farbe: "blue",
      schluessel: "reise",
      werte: { titel: q.reiseOffen.titel },
      link: `/reisen/${q.reiseOffen.id}`,
    });
  }
  if (q.beitrag !== undefined) {
    if (q.beitrag === null) {
      liste.push({
        id: "beitrag",
        art: "beitrag",
        farbe: "amber",
        schluessel: "beitrag_offen",
        link: q.beitragLink ?? "/mon-adhesion",
      });
    } else if (q.beitrag.status !== "payee") {
      liste.push({
        id: "beitrag",
        art: "beitrag",
        farbe: q.beitrag.status === "echouee" ? "red" : "amber",
        schluessel: q.beitrag.status === "echouee" ? "beitrag_fehlgeschlagen" : "beitrag_wartet",
        werte: { betrag: q.beitrag.betrag },
        link: q.beitragLink ?? "/mon-adhesion",
      });
    }
  }
  for (const a of q.anmeldungen ?? []) {
    liste.push({
      id: `anmeldung:${a.id}`,
      art: "anmeldung",
      farbe: "amber",
      schluessel: "anmeldung",
      werte: { titel: a.titel, betrag: a.betrag },
      link: "/mon-adhesion",
    });
  }
  return liste;
}

/** Tipps sind bis einen Tag vor dem Anpfiff möglich (siehe TippspielTipSerializer). */
export function tippFristOffen(spiel: RencontreCalendrier, jetzt: number = Date.now()): boolean {
  return new Date(spiel.date_heure).getTime() - MS_TAG > jetzt;
}
