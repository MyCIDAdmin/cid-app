/** Pfad-Präfix → Schlüssel in help.json. Längere Präfixe zuerst. */
export const HILFE_ROUTEN: ReadonlyArray<readonly [string, string]> = [
  ["/admin/campagnes-adhesion", "campagnes"],
  ["/admin/justificatifs", "justificatifs"],
  ["/admin/articles-cotisation", "articles"],
  ["/admin/configuration-site", "hero"],
  ["/admin/fan-club-logos", "logos"],
  ["/admin/notifications", "notifications"],
  ["/admin/partner", "partner"],
  ["/admin/boutique", "boutique"],
  ["/admin/events", "events"],
  ["/admin/projets", "projets"],
  ["/admin/albums", "albums"],
  ["/admin/roles", "roles"],
  ["/admin/quiz", "quiz"],
  ["/cotisations/en-attente", "paiements"],
  ["/cotisations/import", "zahlungen_import"],
  ["/cotisations/relances", "relances"],
  ["/membres/import", "membres_import"],
  ["/membres/zuordnung", "membres_zuordnung"],
  ["/membres", "membres"],
  ["/inscriptions", "inscriptions"],
  ["/kalender", "kalender"],
  ["/regionen/wettbewerb", "regionen_wettbewerb"],
  ["/regionen/bericht", "regionen_bericht"],
  ["/regionen", "regionen"],
  ["/stats", "stats"],
  ["/admin/finances", "finances"],
];

export function cleHilfe(pathname: string, search = ""): string | null {
  if (pathname === "/cotisations/en-attente" && new URLSearchParams(search).get("tab") === "import")
    return "zahlungen_import";
  if (/^\/projets\/[^/]+\/arbeitsbereich$/.test(pathname)) return "arbeitsbereich";
  const treffer = HILFE_ROUTEN.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  return treffer ? treffer[1] : null;
}
