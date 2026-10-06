/**
 * Anzeige von Texten in der gewählten Sprache (Nutzerwunsch 2026-10-06): Das Backend liefert
 * zu Projekten, Veranstaltungen, Produkten, Angeboten und Alben ein Feld `uebersetzungen`
 * ({feld: {sprache: text}}), das DeepL beim Speichern füllt (apps.uebersetzung). Fehlt eine
 * Übersetzung, wird der Originaltext gezeigt.
 */
import i18n from "../i18n";

export type Uebersetzungen = Record<string, Partial<Record<"de" | "fr" | "ar", string>>>;

export interface Uebersetzbar {
  uebersetzungen?: Uebersetzungen;
}

export function uebersetzt<T extends object>(
  objekt: T,
  feld: string,
  sprache: string = i18n.language,
): string {
  const original = String((objekt as unknown as Record<string, unknown>)[feld] ?? "");
  const kurz = (sprache ?? "").slice(0, 2) as "de" | "fr" | "ar";
  return (objekt as Uebersetzbar).uebersetzungen?.[feld]?.[kurz] || original;
}
