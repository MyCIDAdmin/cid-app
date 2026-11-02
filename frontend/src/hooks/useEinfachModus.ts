/** Schalter „Erklärungen“ der Finanzseiten: blendet „Einfach erklärt“-Hinweise ein oder aus.
 * Standard: an. Gemerkt wird nur im Browser (Komfort, kein Fachzustand). */
import { useSyncExternalStore } from "react";

const SCHLUESSEL = "cid.finanzen.einfach";
const hoerer = new Set<() => void>();

function lesen(): boolean {
  try {
    return window.localStorage.getItem(SCHLUESSEL) !== "aus";
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
