/** Hilfsfunktionen zu „Hilfe gesucht“. */
import type { HilfeKategorieKurz } from "../types/projets";

/** Name einer Kategorie in der Sprache der Person (Französisch fällt auf Deutsch zurück). */
export function kategorieName(
  kategorie: Pick<HilfeKategorieKurz, "name_de" | "name_fr">,
  sprache: string,
): string {
  return sprache.startsWith("fr") && kategorie.name_fr ? kategorie.name_fr : kategorie.name_de;
}
