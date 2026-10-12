/**
 * Preis und Bestand einer gewählten Variante (Release 6, 2026-10-12). Der Server liefert pro
 * Variante den bereits aufgelösten Preis (`prix_affiche`, `est_prix_membre`, `prix_final`) — hier
 * nur die Auswahl mit Rückfall auf die Produktwerte (Varianten ohne eigenen Preis, ältere
 * Antworten). Es wird nie selbst gerechnet (CLAUDE.md §8).
 */
import type { Produit, VarianteProduit } from "../types/boutique";

export interface PreisInfo {
  /** Der tatsächlich berechnete Preis für den aktuellen Benutzer. */
  affiche: string;
  /** Preis nach Rabatt, ohne Mitgliederpreis. */
  final: string;
  /** Normaler Preis vor Rabatt (Basis für „durchgestrichen“). */
  basis: string;
  istMitglied: boolean;
}

export function preisInfo(produit: Produit, variante?: VarianteProduit | null): PreisInfo {
  if (variante && variante.prix_affiche !== undefined) {
    return {
      affiche: variante.prix_affiche,
      final: variante.prix_final ?? variante.prix_affiche,
      basis: variante.prix ?? produit.prix,
      istMitglied: variante.est_prix_membre ?? false,
    };
  }
  return {
    affiche: produit.prix_affiche,
    final: produit.prix_final,
    basis: produit.prix,
    istMitglied: produit.est_prix_membre,
  };
}

export interface BestandInfo {
  stock: number;
  faible: boolean;
  rupture: boolean;
}

/** Bestand der gewählten Variante, wenn das Produkt mehrere Varianten hat; sonst Gesamtbestand. */
export function bestandInfo(produit: Produit, variante?: VarianteProduit | null): BestandInfo {
  if (variante && produit.variantes.length > 1) {
    return {
      stock: variante.stock,
      faible: variante.stock > 0 && variante.stock < produit.seuil_alerte_stock,
      rupture: variante.stock <= 0,
    };
  }
  return { stock: produit.stock_total, faible: produit.stock_faible, rupture: produit.en_rupture };
}
