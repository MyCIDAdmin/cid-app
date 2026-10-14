import type { Sprachtext } from "../types/aktivitaet";

/** Bezeichnung in der Sprache der Oberfläche (Arabisch fällt auf Deutsch zurück). */
export function textIn(sprache: string, text: Sprachtext): string {
  return sprache.startsWith("fr") ? text.fr : text.de;
}

export function zeitpunkt(iso: string | null, sprache: string): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleString(sprache.startsWith("fr") ? "fr-FR" : "de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  });
}
