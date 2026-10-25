/** Hilfen für Beitragsaktionen (Frist, Dringlichkeit, Beträge). */
import type { ArticleCatalogue } from "../types/cotisation";

const TAG_MS = 24 * 60 * 60 * 1000;

/** Heutiges Datum als YYYY-MM-DD in der Ortszeit. */
export function heuteIso(jetzt: Date = new Date()): string {
  const m = String(jetzt.getMonth() + 1).padStart(2, "0");
  const d = String(jetzt.getDate()).padStart(2, "0");
  return `${jetzt.getFullYear()}-${m}-${d}`;
}

/** Verbleibende Tage bis zur Frist (0 = heute letzter Tag, negativ = abgelaufen) oder null. */
export function tageBisFrist(frist: string | null, jetzt: Date = new Date()): number | null {
  if (!frist) return null;
  const ziel = Date.parse(`${frist}T00:00:00`);
  const heute = Date.parse(`${heuteIso(jetzt)}T00:00:00`);
  if (Number.isNaN(ziel)) return null;
  return Math.round((ziel - heute) / TAG_MS);
}

/** Sprachabhängig formatiertes Datum (YYYY-MM-DD → 24.12.2026). */
export function formatFrist(frist: string, sprache: string): string {
  const [j, m, t] = frist.split("-");
  return sprache.startsWith("fr") ? `${t}/${m}/${j}` : `${t}.${m}.${j}`;
}

/** Eine Aktion ist dringlich, wenn sie als wichtig markiert ist oder die Frist in 3 Tagen endet. */
export function istDringlich(
  a: Pick<ArticleCatalogue, "dringend" | "frist" | "abgelaufen">,
): boolean {
  if (a.abgelaufen) return false;
  if (a.dringend) return true;
  const tage = tageBisFrist(a.frist);
  return tage !== null && tage >= 0 && tage <= 3;
}

/** Nur eigene, aktive, nicht abgelaufene Artikel sind für Mitglieder wählbare Aktionen. */
export function istWaehlbareAktion(
  a: Pick<ArticleCatalogue, "actif" | "type_fixe" | "abgelaufen">,
): boolean {
  return a.actif && a.type_fixe === null && !a.abgelaufen;
}
