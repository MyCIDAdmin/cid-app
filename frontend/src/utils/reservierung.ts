import type { Produit } from "../types/boutique";

/** Reservierung/Bestellung eines Produkts ist beendet (Frist abgelaufen oder ausgebucht). */
export function reservierungGeschlossen(produit: Produit): boolean {
  return produit.reservierung_modus !== "aus" && !produit.reservierung_offen;
}

/** Reservierungsartikel, dessen Frist abgelaufen ist: verschwindet aus dem Shop (Wunsch
 * 2026-10-20). Der Server blendet ihn für Nicht-Verwalter schon aus; hier auch für Verwalter. */
export function reservierungFristAbgelaufen(produit: Produit, jetzt: number = Date.now()): boolean {
  if (produit.reservierung_modus === "aus" || !produit.reservierung_frist) return false;
  const frist = Date.parse(produit.reservierung_frist);
  return Number.isFinite(frist) && frist < jetzt;
}
