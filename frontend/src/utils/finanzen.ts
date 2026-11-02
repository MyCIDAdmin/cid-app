/** Kleine Formatierungs-Helfer für die Finanzseiten (Beträge kommen als Dezimal-Strings). */

export function euro(wert: string | number, sprache = "de"): string {
  return `${Number(wert).toLocaleString(sprache === "fr" ? "fr-FR" : "de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })} €`;
}

/** Mit Vorzeichen (+/−), für Ergebnis und Veränderungen. */
export function euroSigniert(wert: string | number, sprache = "de"): string {
  const zahl = Number(wert);
  const vorzeichen = zahl > 0 ? "+" : zahl < 0 ? "−" : "";
  return `${vorzeichen}${euro(Math.abs(zahl), sprache)}`;
}

export function prozentVon(teil: string | number, ganz: string | number): number {
  const g = Number(ganz);
  return g ? Math.round((Number(teil) / g) * 100) : 0;
}
