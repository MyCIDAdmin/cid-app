import type { PartnerKategorie } from "../types/partner";

/** Kategoriename in der UI-Sprache (Französisch, falls gepflegt; sonst Deutsch). */
export function kategorieName(
  k: Pick<PartnerKategorie, "nom" | "nom_fr">,
  sprache: string,
): string {
  return sprache.startsWith("fr") && k.nom_fr ? k.nom_fr : k.nom;
}
