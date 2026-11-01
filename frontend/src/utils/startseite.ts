/** Auswahl und Sortierung der Bausteine auf der Startseite nach der Anmeldung (reine Funktionen). */
import type { Produit } from "../types/boutique";
import type { Projet } from "../types/projets";
import type { RanglisteZeile } from "../types/regionen";

export type ArenaSortierung = "pro_mitglied" | "gesamt";
const MAX_PROJEKTE = 3;
const MAX_ARTIKEL = 3;

export function sortiereRegionen(
  zeilen: RanglisteZeile[],
  sortierung: ArenaSortierung,
): RanglisteZeile[] {
  const wert = (z: RanglisteZeile) =>
    sortierung === "pro_mitglied" ? z.punkte_pro_mitglied : z.punkte;
  return [...zeilen].sort((a, b) => wert(b) - wert(a) || b.punkte - a.punkte);
}

export function waehleProjekte(projekte: Projet[]): Projet[] {
  return projekte
    .filter((p) => p.statut === "en_cours")
    .sort(
      (a, b) =>
        (b.nb_teilprojekte ?? 0) - (a.nb_teilprojekte ?? 0) ||
        Number(Boolean(a.parent)) - Number(Boolean(b.parent)) ||
        a.ordre - b.ordre,
    )
    .slice(0, MAX_PROJEKTE);
}

export function waehleArtikel(produkte: Produit[]): Produit[] {
  return produkte
    .filter((p) => p.statut === "publie" && p.type_produit !== "bon_achat")
    .sort((a, b) => Number(b.nouveaute) - Number(a.nouveaute))
    .slice(0, MAX_ARTIKEL);
}
