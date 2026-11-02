/** Schalter „Erklärungen“ (gilt für alle Module mit Erklär-Ebene, z. B. Finanzen und Shop-
 * Verwaltung): blendet „Einfach erklärt“-Hinweise ein oder aus. Standard: an. Gemerkt wird nur im
 * Browser (Komfort, kein Fachzustand). Der frühere Schlüssel der Finanzseiten wird weiter
 * gelesen, solange noch keine neue Wahl gespeichert ist. */
import { useSyncExternalStore } from "react";

const SCHLUESSEL = "cid.einfach";
const ALTER_SCHLUESSEL = "cid.finanzen.einfach";
const hoerer = new Set<() => void>();

function lesen(): boolean {
  try {
    const wert =
      window.localStorage.getItem(SCHLUESSEL) ?? window.localStorage.getItem(ALTER_SCHLUESSEL);
    return wert !== "aus";
  } catch {
    return true;
  }
}

function setzen(an: boolean): void {
  try {
    window.localStorage.setItem(SCHLUESSEL, an ? "an" : "aus");
  } catch {
    /* ohne Speicher gilt der Standard */
  }
  hoerer.forEach((h) => h());
}

function abonnieren(h: () => void): () => void {
  hoerer.add(h);
  return () => hoerer.delete(h);
}

export function useEinfachModus(): [boolean, (an: boolean) => void] {
  const an = useSyncExternalStore(abonnieren, lesen, () => true);
  return [an, setzen];
}
