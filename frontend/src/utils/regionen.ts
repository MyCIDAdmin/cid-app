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
