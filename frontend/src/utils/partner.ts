import type { PartnerKategorie } from "../types/partner";

/** Kategoriename in der UI-Sprache (Französisch, falls gepflegt; sonst Deutsch). */
export function kategorieName(
  k: Pick<PartnerKategorie, "nom" | "nom_fr">,
  sprache: string,
): string {
  return sprache.startsWith("fr") && k.nom_fr ? k.nom_fr : k.nom;
}

const TAG_MS = 86_400_000;

/** Verbleibende Tage bis zum Datum (negativ = abgelaufen). */
export function tageBis(datum: string, heute = new Date()): number {
  const ziel = new Date(`${datum}T00:00:00`);
  const start = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate());
  return Math.round((ziel.getTime() - start.getTime()) / TAG_MS);
}

/** Betrag (Dezimal-String oder Zahl) als Euro-Betrag in der Sprache der Oberfläche. */
export function formatBetrag(wert: string | number, sprache: string): string {
  const zahl = typeof wert === "number" ? wert : Number(wert);
  return new Intl.NumberFormat(sprache === "fr" ? "fr-FR" : "de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(Number.isFinite(zahl) ? zahl : 0);
}
