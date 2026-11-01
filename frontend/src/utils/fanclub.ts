/**
 * Reine Hilfsfunktionen für das Fan-Club-Modul (Reiter Tabelle, Spielplan, Statistiken, Spieltag).
 * Keine React-Abhängigkeit, damit alles ohne Rendern testbar ist.
 */
import type { ClassementLigue, RencontreCalendrier, WettbewerbArt } from "../types/communaute";

export const EQUIPE_SUIVIE = "Club Africain";
export const COMPETITION_LIGUE_1 = "Ligue 1";

// ---------------------------------------------------------------------------
// Tabelle
// ---------------------------------------------------------------------------

export type ZoneArt = "oben" | "abstieg" | null;

/** Zone aus dem Text der Liga-API (z. B. „Promotion - CAF Champions League (Qualification)“,
 * „Relegation“). Alles, was nach Aufstieg/Qualifikation klingt, gilt als obere Zone. */
export function zoneArt(zoneText: string): ZoneArt {
  const text = zoneText.toLowerCase();
  if (!text) return null;
  if (/relegat|abstieg|descente|d[ée]gradation/.test(text)) return "abstieg";
  if (/promotion|champions|qualif|confedera|conf[ée]d[ée]ration|libertadores|aufstieg/.test(text)) {
    return "oben";
  }
  return null;
}

/** Plätze gewonnen (+) oder verloren (−) seit dem letzten Spieltag ; null = kein Vergleich. */
export function trend(ligne: Pick<ClassementLigue, "rang" | "rang_vorher">): number | null {
  if (ligne.rang_vorher === null || ligne.rang_vorher === undefined) return null;
  return ligne.rang_vorher - ligne.rang;
}

export interface TabellenKpis {
  rang: number;
  punkte: number;
  /** Punkte Rückstand auf Platz 1 (0, wenn man selbst führt). */
  abstandPlatz1: number;
  /** Punkte Rückstand auf Platz 2 (nur wenn man selbst führt: Vorsprung als negative Zahl). */
  abstandPlatz2: number | null;
  /** Vorsprung auf die beste Mannschaft der Abstiegszone ; null, wenn die Zone unbekannt ist. */
  polsterAbstieg: number | null;
}

export function tabellenKpis(
  lignen: ClassementLigue[],
  equipe = EQUIPE_SUIVIE,
): TabellenKpis | null {
  const eigene = lignen.find((l) => l.equipe === equipe);
  if (!eigene) return null;
  const sortiert = [...lignen].sort((a, b) => a.rang - b.rang);
  const erster = sortiert[0];
  const zweiter = sortiert[1];
  const abstieg = sortiert.filter((l) => zoneArt(l.zone_texte) === "abstieg");
  const bestePlatzAbstieg = abstieg.length > 0 ? Math.max(...abstieg.map((l) => l.points)) : null;
  return {
    rang: eigene.rang,
    punkte: eigene.points,
    abstandPlatz1: Math.max(0, erster.points - eigene.points),
    abstandPlatz2: zweiter ? zweiter.points - eigene.points : null,
    polsterAbstieg: bestePlatzAbstieg === null ? null : eigene.points - bestePlatzAbstieg,
  };
}

// ---------------------------------------------------------------------------
// Ergebnisse von Club Africain
// ---------------------------------------------------------------------------

export type Ausgang = "sieg" | "unentschieden" | "niederlage";

export function istClubSpiel(r: RencontreCalendrier, equipe = EQUIPE_SUIVIE): boolean {
  return r.equipe_domicile === equipe || r.equipe_exterieur === equipe;
}

export function istHeimspiel(r: RencontreCalendrier, equipe = EQUIPE_SUIVIE): boolean {
  return r.equipe_domicile === equipe;
}

/** Tore (für, gegen) aus Sicht des Clubs ; null, wenn Ergebnis fehlt oder der Club nicht spielt. */
export function toreAusSicht(
  r: RencontreCalendrier,
  equipe = EQUIPE_SUIVIE,
): { fuer: number; gegen: number } | null {
  if (r.score_domicile === null || r.score_exterieur === null) return null;
  if (r.equipe_domicile === equipe) return { fuer: r.score_domicile, gegen: r.score_exterieur };
  if (r.equipe_exterieur === equipe) return { fuer: r.score_exterieur, gegen: r.score_domicile };
  return null;
}

export function ausgang(r: RencontreCalendrier, equipe = EQUIPE_SUIVIE): Ausgang | null {
  const tore = toreAusSicht(r, equipe);
  if (!tore) return null;
  if (tore.fuer > tore.gegen) return "sieg";
  if (tore.fuer < tore.gegen) return "niederlage";
  return "unentschieden";
}

export function punkteVonAusgang(a: Ausgang | null): number {
  if (a === "sieg") return 3;
  if (a === "unentschieden") return 1;
  return 0;
}

/** Bornen [Anfang, Ende[ der Saison „Juli → Juni“ aus „2026-2027“. */
export function limitesSaison(saison: string | undefined): { debut: number; fin: number } | null {
  if (!saison) return null;
  const anneeDebut = Number(saison.split("-")[0]);
  if (!Number.isFinite(anneeDebut)) return null;
  return { debut: Date.UTC(anneeDebut, 6, 1), fin: Date.UTC(anneeDebut + 1, 6, 1) };
}

/** Beendete Ligue-1-Spiele des Clubs in der laufenden Saison, zeitlich aufsteigend. */
export function ligaSpieleDerSaison(
  rencontres: RencontreCalendrier[],
  saison: string | undefined,
): RencontreCalendrier[] {
  const limites = limitesSaison(saison);
  return rencontres
    .filter((r) => {
      if (r.competition !== COMPETITION_LIGUE_1) return false;
      if (r.statut !== "FINISHED") return false;
      if (r.score_domicile === null || r.score_exterieur === null) return false;
      if (!istClubSpiel(r)) return false;
      if (limites === null) return true;
      const zeit = new Date(r.date_heure).getTime();
      return zeit >= limites.debut && zeit < limites.fin;
    })
    .sort((a, b) => a.date_heure.localeCompare(b.date_heure));
}

export interface Serien {
  /** Aktuelle Serie : Art und Länge (z. B. 3 Siege in Folge). */
  aktuell: { art: Ausgang; laenge: number } | null;
  laengsteSiegserie: number;
  laengsteUngeschlagen: number;
  /** Aktuelle Serie ohne Niederlage. */
  ungeschlagenAktuell: number;
  spieleOhneGegentor: number;
}

export function serien(spiele: RencontreCalendrier[]): Serien {
  let aktuell: Serien["aktuell"] = null;
  let siege = 0;
  let laengsteSieg = 0;
  let ungeschlagen = 0;
  let laengsteUngeschlagen = 0;
  let ohneGegentor = 0;
  let zuNull = 0;
  for (const spiel of spiele) {
    const art = ausgang(spiel);
    const tore = toreAusSicht(spiel);
    if (art === null || tore === null) continue;
    if (aktuell && aktuell.art === art) aktuell = { art, laenge: aktuell.laenge + 1 };
    else aktuell = { art, laenge: 1 };
    siege = art === "sieg" ? siege + 1 : 0;
    laengsteSieg = Math.max(laengsteSieg, siege);
    ungeschlagen = art === "niederlage" ? 0 : ungeschlagen + 1;
    laengsteUngeschlagen = Math.max(laengsteUngeschlagen, ungeschlagen);
    zuNull = tore.gegen === 0 ? zuNull + 1 : 0;
    ohneGegentor = zuNull;
  }
  return {
    aktuell,
    laengsteSiegserie: laengsteSieg,
    laengsteUngeschlagen,
    ungeschlagenAktuell: ungeschlagen,
    spieleOhneGegentor: ohneGegentor,
  };
}

export interface HeimAuswaerts {
  spiele: number;
  siege: number;
  unentschieden: number;
  niederlagen: number;
  punkte: number;
  toreFuer: number;
  toreGegen: number;
}

export function heimAuswaertsBilanz(spiele: RencontreCalendrier[]): {
  heim: HeimAuswaerts;
  auswaerts: HeimAuswaerts;
} {
  const leer = (): HeimAuswaerts => ({
    spiele: 0,
    siege: 0,
    unentschieden: 0,
    niederlagen: 0,
    punkte: 0,
    toreFuer: 0,
    toreGegen: 0,
  });
  const heim = leer();
  const auswaerts = leer();
  for (const spiel of spiele) {
    const art = ausgang(spiel);
    const tore = toreAusSicht(spiel);
    if (!art || !tore) continue;
    const ziel = istHeimspiel(spiel) ? heim : auswaerts;
    ziel.spiele += 1;
    ziel.toreFuer += tore.fuer;
    ziel.toreGegen += tore.gegen;
    ziel.punkte += punkteVonAusgang(art);
    if (art === "sieg") ziel.siege += 1;
    else if (art === "unentschieden") ziel.unentschieden += 1;
    else ziel.niederlagen += 1;
  }
  return { heim, auswaerts };
}

// ---------------------------------------------------------------------------
// Spielplan
// ---------------------------------------------------------------------------

export type SpielplanFilter = "alle" | "liga" | "pokal" | "kontinental" | "heim" | "auswaerts";

export const SPIELPLAN_FILTER: SpielplanFilter[] = [
  "alle",
  "liga",
  "pokal",
  "kontinental",
  "heim",
  "auswaerts",
];

const ART_FUER_FILTER: Partial<Record<SpielplanFilter, WettbewerbArt>> = {
  liga: "liga",
  pokal: "pokal",
  kontinental: "kontinental",
};

export function passtZumFilter(r: RencontreCalendrier, filter: SpielplanFilter): boolean {
  if (filter === "alle") return true;
  if (filter === "heim") return istHeimspiel(r);
  if (filter === "auswaerts") return r.equipe_exterieur === EQUIPE_SUIVIE;
  return r.art === ART_FUER_FILTER[filter];
}

/** Schlüssel „2026-10“ für die Monatsgruppen (lokale Zeit). */
export function monatsSchluessel(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Spiele in Reihenfolge der Eingabe in Monatsgruppen aufteilen. */
export function nachMonaten(
  rencontres: RencontreCalendrier[],
): { schluessel: string; spiele: RencontreCalendrier[] }[] {
  const gruppen: { schluessel: string; spiele: RencontreCalendrier[] }[] = [];
  for (const spiel of rencontres) {
    const schluessel = monatsSchluessel(spiel.date_heure);
    const letzte = gruppen[gruppen.length - 1];
    if (letzte && letzte.schluessel === schluessel) letzte.spiele.push(spiel);
    else gruppen.push({ schluessel, spiele: [spiel] });
  }
  return gruppen;
}

// ---------------------------------------------------------------------------
// Tippspiel
// ---------------------------------------------------------------------------

export const SPERRE_VOR_ANPFIFF_MS = 24 * 60 * 60 * 1000;

/** Die Tippabgabe schließt 1 Tag vor Anpfiff (der Server entscheidet endgültig). */
export function tippsOffen(r: RencontreCalendrier, jetzt = Date.now()): boolean {
  return (
    r.competition === COMPETITION_LIGUE_1 &&
    r.est_a_venir &&
    new Date(r.date_heure).getTime() - jetzt > SPERRE_VOR_ANPFIFF_MS
  );
}

/** Tendenz eines Ergebnisses : 1 Heimsieg, 0 Remis, −1 Auswärtssieg. */
export function tendenz(heim: number, gast: number): -1 | 0 | 1 {
  return heim > gast ? 1 : heim < gast ? -1 : 0;
}

export interface TippGruppe {
  ergebnis: string;
  anzahl: number;
  namen: string[];
}

/** Tipp-Wand : gleiche Tipps zusammenfassen, häufigste zuerst. */
export function tippGruppen(tipps: { name: string; d: number; e: number }[]): TippGruppe[] {
  const karte = new Map<string, TippGruppe>();
  for (const tipp of tipps) {
    const schluessel = `${tipp.d}:${tipp.e}`;
    const gruppe = karte.get(schluessel) ?? { ergebnis: schluessel, anzahl: 0, namen: [] };
    gruppe.anzahl += 1;
    gruppe.namen.push(tipp.name);
    karte.set(schluessel, gruppe);
  }
  return [...karte.values()].sort(
    (a, b) => b.anzahl - a.anzahl || a.ergebnis.localeCompare(b.ergebnis),
  );
}

/** Verteilung Heimsieg / Remis / Auswärtssieg in Prozent (Summe 100, falls Tipps vorhanden). */
export function tendenzVerteilung(tipps: { d: number; e: number }[]): {
  heim: number;
  remis: number;
  gast: number;
} {
  if (tipps.length === 0) return { heim: 0, remis: 0, gast: 0 };
  const zaehler = { heim: 0, remis: 0, gast: 0 };
  for (const tipp of tipps) {
    const t = tendenz(tipp.d, tipp.e);
    if (t > 0) zaehler.heim += 1;
    else if (t < 0) zaehler.gast += 1;
    else zaehler.remis += 1;
  }
  const heim = Math.round((zaehler.heim / tipps.length) * 100);
  const gast = Math.round((zaehler.gast / tipps.length) * 100);
  return { heim, gast, remis: Math.max(0, 100 - heim - gast) };
}
