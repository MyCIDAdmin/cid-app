/** Namen einer Kostenart/Kategorie je Sprache (`{fr, de, ar}`, vom Backend mit Rückfall auf
 * Französisch gefüllt). `fallback` = der französische Name, falls `namen` fehlt. */
export type KategorieNamen = Partial<Record<"fr" | "de" | "ar", string>>;

export function kategorieName(
  namen: KategorieNamen | undefined | null,
  fallback: string,
  sprache: string,
): string {
  const code = (sprache || "fr").slice(0, 2) as "fr" | "de" | "ar";
  return namen?.[code] || fallback;
}
