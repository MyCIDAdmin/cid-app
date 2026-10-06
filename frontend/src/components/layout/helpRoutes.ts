/** Pfad-Präfix → Schlüssel in help.json. Längere Präfixe zuerst. */
export const HILFE_ROUTEN: ReadonlyArray<readonly [string, string]> = [
  ["/admin/campagnes-adhesion", "campagnes"],
  ["/admin/justificatifs", "justificatifs"],
  ["/admin/articles-cotisation", "articles"],
  ["/admin/configuration-site", "hero"],
  ["/admin/fan-club-logos", "logos"],
  ["/admin/notifications", "notifications"],
  ["/admin/boutique", "boutique"],
  ["/admin/events", "events"],
  ["/admin/projets", "projets"],
  ["/admin/albums", "albums"],
  ["/admin/roles", "roles"],
  ["/admin/quiz", "quiz"],
  ["/cotisations/en-attente", "paiements"],
  ["/cotisations/relances", "relances"],
  ["/inscriptions", "inscriptions"],
  ["/stats", "stats"],
];

export function cleHilfe(pathname: string): string | null {
  const treffer = HILFE_ROUTEN.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return treffer ? treffer[1] : null;
}

