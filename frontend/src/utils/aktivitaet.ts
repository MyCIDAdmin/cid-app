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

const SYSTEMROLLEN = ["membre", "rh", "bureau_admin", "dir_financier", "super_admin"] as const;

/**
 * Rollen eines Kontos in der Sprache der Oberfläche. Der Server liefert Kennungen
 * (`super_admin`, danach Namen eigener Rollen); ältere Protokolleinträge enthalten den
 * ausgeschriebenen Namen in deutscher oder französischer Sprache und werden ebenfalls erkannt.
 */
export function rollenText(roh: string, t: (key: string, opts?: object) => unknown): string {
  return roh
    .split(", ")
    .map((teil) => {
      const code = SYSTEMROLLEN.find(
        (r) =>
          r === teil ||
          ["de", "fr"].some(
            (lng) => t(`utilisateurs:role.${r}`, { lng, defaultValue: "" }) === teil,
          ),
      );
      return code ? t(`utilisateurs:role.${code}`) : teil;
    })
    .join(", ");
}
