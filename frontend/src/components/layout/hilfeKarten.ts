/**
 * Gemeinsame Typen und Hilfen für die Aufgabenkarten (Konzept_Aufgabenkarten.md). Eine Karte ist
 * ein Ablauf (`workflows`) aus help.json ; dieselben Texte speisen den Hilfe-Begleiter und die
 * Seite „Aufgabenkarten“ (Ansicht, Druck/PDF). Alle neuen Felder sind optional, damit Abläufe
 * ohne Ergänzung weiter funktionieren.
 */
import { HILFE_ROUTEN } from "./helpRoutes";

/** Rollen einer Karte : die Rollen der App plus die zwei Funktionsrollen je Veranstaltung/Region. */
export const KARTEN_ROLLEN = [
  "rh",
  "bureau_admin",
  "dir_financier",
  "super_admin",
  "region",
  "einlass",
] as const;
export type KartenRolle = (typeof KARTEN_ROLLEN)[number];

export interface Fehlerfall {
  problem: string;
  loesung: string;
}

export interface KartenBild {
  /** Nummer des Schritts (ab 1), zu dem das Bild gehört. */
  schritt: number;
  /** Dateiname unter /hilfe/bilder/. */
  datei: string;
  alt: string;
}

export interface Workflow {
  titre: string;
  wann?: string;
  schritte: string[];
  beispiel?: string;
  danach?: string;
  /** Stabile Kennung der Karte (z. B. ZAHL-01), unabhängig vom Titel. */
  id?: string;
  rollen?: string[];
  vorher?: string;
  /** Parallel zu `schritte` : „Du siehst jetzt …“ (leere Einträge erlaubt). */
  erwartet?: string[];
  fehler?: Fehlerfall[];
  uebung?: string;
  bilder?: KartenBild[];
}

/** Eintrag des Glossars (help.json → orientierung.glossar.begriffe). */
export interface Glossarbegriff {
  begriff: string;
  text: string;
}

/** Aufgabe im Jahresrhythmus ; `karten` verweist auf Kennungen von Karten. */
export interface RhythmusAufgabe {
  text: string;
  karten: string[];
}

export interface RhythmusZeitraum {
  wann: string;
  aufgaben: RhythmusAufgabe[];
}

export interface RollenEinstieg {
  text: string;
  start: string[];
}

export interface KartenBereich {
  cle: string;
  titel: string;
  karten: Workflow[];
}

/** Alle Hilfebereiche, die Karten enthalten können (Reihenfolge wie in den Hilfe-Routen). */
export const KARTEN_BEREICHE: readonly string[] = Array.from(
  new Set([...HILFE_ROUTEN.map(([, cle]) => cle), "arbeitsbereich"]),
);

export function liste<T>(wert: unknown): T[] {
  return Array.isArray(wert) ? (wert as T[]) : [];
}

/** Karte passt zur Rolle ; Karten ohne Rollenangabe gelten für alle. */
export function passtZurRolle(karte: Workflow, rolle: string): boolean {
  if (!rolle) return true;
  const rollen = karte.rollen ?? [];
  return rollen.length === 0 || rollen.includes(rolle);
}

/** Karte passt zum Suchtext (Kennung, Titel, Anlass, Schritte, Beispiel). */
export function passtZurSuche(karte: Workflow, suche: string): boolean {
  const s = suche.trim().toLowerCase();
  if (!s) return true;
  const text = [karte.id, karte.titre, karte.wann, karte.beispiel, ...karte.schritte]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return text.includes(s);
}

export function kartenSchluessel(cle: string, karte: Workflow): string {
  return karte.id ?? `${cle}/${karte.titre}`;
}

/** Glossarbegriff passt zum Suchtext (Begriff oder Erklärung). */
export function passtZumGlossar(eintrag: Glossarbegriff, suche: string): boolean {
  const s = suche.trim().toLowerCase();
  if (!s) return true;
  return `${eintrag.begriff} ${eintrag.text}`.toLowerCase().includes(s);
}
