/** Klassen für den Filterblock : auf dem Handy nur sichtbar, wenn aufgeklappt ; ab md immer. */
export function filterBlockKlasse(offen: boolean): string {
  return offen ? "flex" : "hidden md:flex";
}
