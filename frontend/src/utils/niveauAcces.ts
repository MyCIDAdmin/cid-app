import type { NiveauAcces } from "../types/rbac";

/**
 * Zugriffsmatrix (Rollenverwaltung, 2026-10-12) : zwei Checkboxen "Lesen"/"Schreiben" pro Rolle
 * und Modul, abgebildet auf die unveränderten Backend-Stufen aucun / lecture / lecture_ecriture.
 * "Schreiben" setzt "Lesen" voraus : Schreiben anhaken hakt auch Lesen an, Lesen abhaken hakt
 * auch Schreiben ab.
 */
export function niveauApresClic(
  actuel: NiveauAcces,
  champ: "lecture" | "ecriture",
  coche: boolean,
): NiveauAcces {
  if (champ === "lecture") return coche ? (actuel === "aucun" ? "lecture" : actuel) : "aucun";
  return coche ? "lecture_ecriture" : "lecture";
}
