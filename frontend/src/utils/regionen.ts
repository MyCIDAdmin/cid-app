/** Text in der Sprache der Oberfläche ; fehlt er, wird die andere Sprache gezeigt. */
export function beschreibungIn(sprache: string, text: { de: string; fr: string }): string {
  const fr = sprache.startsWith("fr");
  return (fr ? text.fr || text.de : text.de || text.fr).trim();
}

export function anfangsbuchstaben(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((teil) => teil[0]?.toUpperCase() ?? "")
    .join("");
}

/** Anzeige der festen Reaktionen (gespeichert wird nur die Kennung). */
export const REAKTIONS_EMOJI = {
  daumen: "👍",
  herz: "❤️",
  feier: "🎉",
  applaus: "👏",
  staunen: "😮",
} as const;

export function formatDatum(iso: string, sprache: string): string {
  const [j, m, t] = iso.split("-").map(Number);
  return new Date(j, m - 1, t).toLocaleDateString(sprache, {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
