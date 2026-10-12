import type { Produit } from "../types/boutique";

/** Reservierung/Bestellung eines Produkts ist beendet (Frist abgelaufen oder ausgebucht). */
export function reservierungGeschlossen(produit: Produit): boolean {
  return produit.reservierung_modus !== "aus" && !produit.reservierung_offen;
}
