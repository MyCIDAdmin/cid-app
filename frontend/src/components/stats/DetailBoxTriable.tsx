/**
 * Table de détail triable — généralisation du couple EnTeteTriable/trierJoueurs de
 * components/communaute/StatistiquesTab.tsx, réutilisée pour la "Detail-Box (sortierbare
 * Tabelle) pro aggregiertem Graphen" du module "Statistiken & KPIs" (demande utilisateur du
 * 2026-09-25). Le filtre global (année/ville/statut/...) est déjà appliqué en amont, côté
 * requête (voir StatsPage.tsx : `filtres` partagé par tous les onglets) — cette table ne fait
 * que trier les lignes déjà filtrées, côté client, sans aller-retour réseau supplémentaire.
 */
import type { ReactNode } from "react";
import { useState } from "react";
import { IconArrowDown, IconArrowUp, IconArrowsSort } from "@tabler/icons-react";

export interface ColonneDetailBox<T> {
  /** Clé de tri — sert aussi de clé React pour l'en-tête/la cellule. Si `valeurTri` est
   * omis, `ligne[cle]` doit être directement comparable (string ou number). */
  cle: string;
  label: string;
  align?: "right" | "center";
  /** Rendu personnalisé de la cellule (ex. montant formaté, libellé traduit) — par défaut,
   * `String(ligne[cle])`. */
  render?: (ligne: T) => ReactNode;
  /** Valeur utilisée pour le tri quand `render` transforme l'affichage (ex. un montant
   * "45,00 €" affiché mais trié comme nombre 45). */
  valeurTri?: (ligne: T) => string | number;
}

export default function DetailBoxTriable<T>({
  colonnes,
  lignes,
  getRowKey,
  triInitial,
  directionInitiale = "desc",
  messageVide,
}: {
  colonnes: ColonneDetailBox<T>[];
  lignes: T[];
  getRowKey: (ligne: T) => string;
  triInitial: string;
  directionInitiale?: "asc" | "desc";
  messageVide: string;
}) {
  const [triCle, setTriCle] = useState(triInitial);
  const [triDirection, setTriDirection] = useState<"asc" | "desc">(directionInitiale);

  function trier(cle: string) {
    if (cle === triCle) {
      setTriDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    } else {
      // Premier clic sur une nouvelle colonne : ordre croissant, même convention que
      // StatistiquesTab.tsx (seul le tri par défaut au premier rendu est délibérément choisi
      // par l'appelant via `directionInitiale`, pas un clic).
      setTriCle(cle);
      setTriDirection("asc");
    }
  }

  if (lignes.length === 0) {
    return <p className="text-sm text-text-tertiary">{messageVide}</p>;
  }

  const colonneActive = colonnes.find((colonne) => colonne.cle === triCle);
  const facteur = triDirection === "asc" ? 1 : -1;
  const lignesTriees = [...lignes].sort((a, b) => {
    const valeurA = colonneActive?.valeurTri
      ? colonneActive.valeurTri(a)
      : (a as Record<string, unknown>)[triCle];
    const valeurB = colonneActive?.valeurTri
      ? colonneActive.valeurTri(b)
      : (b as Record<string, unknown>)[triCle];
    if (typeof valeurA === "string" && typeof valeurB === "string") {
      return facteur * valeurA.localeCompare(valeurB);
    }
    return facteur * ((Number(valeurA) || 0) - (Number(valeurB) || 0));
  });

  function classeAlignement(align: ColonneDetailBox<T>["align"]): string {
    if (align === "right") return "text-right";
    if (align === "center") return "text-center";
    return "";
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-text-tertiary/20 text-left uppercase text-text-tertiary">
            {colonnes.map((colonne) => {
              const actif = colonne.cle === triCle;
              const Icone = actif
                ? triDirection === "asc"
                  ? IconArrowUp
                  : IconArrowDown
                : IconArrowsSort;
              return (
                <th key={colonne.cle} className={`py-1.5 ${classeAlignement(colonne.align)}`}>
                  <button
                    type="button"
                    onClick={() => trier(colonne.cle)}
                    aria-sort={actif ? (triDirection === "asc" ? "ascending" : "descending") : "none"}
                    className={`flex items-center gap-1 ${
                      colonne.align === "right"
                        ? "ml-auto"
                        : colonne.align === "center"
                          ? "mx-auto"
                          : ""
                    } ${actif ? "text-text-primary" : "text-text-tertiary hover:text-text-secondary"}`}
                  >
                    {colonne.label}
                    <Icone size={12} />
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {lignesTriees.map((ligne) => (
            <tr key={getRowKey(ligne)} className="border-b border-text-tertiary/10 last:border-0">
              {colonnes.map((colonne) => (
                <td key={colonne.cle} className={`py-1 ${classeAlignement(colonne.align)}`}>
                  {colonne.render
                    ? colonne.render(ligne)
                    : String((ligne as Record<string, unknown>)[colonne.cle] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
