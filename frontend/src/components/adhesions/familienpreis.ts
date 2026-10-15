/** Preis-Vorschau für ein Familienpaket (R34): Grundpreis + Zuschlag je weiterer Person.
 * Nur eine Anzeige – der gespeicherte Preis wird immer vom Server berechnet. */
import type { OffreAdhesion } from "../../types/adhesion";

export function familienPreis(
  offre: Pick<
    OffreAdhesion,
    "prix_plein" | "ist_familienpaket" | "preis_je_erwachsener" | "preis_je_kind"
  >,
  erwachsene: number,
  kinder: number,
): number {
  const grund = Number(offre.prix_plein);
  if (!offre.ist_familienpaket) return grund;
  return (
    grund + Number(offre.preis_je_erwachsener) * erwachsene + Number(offre.preis_je_kind) * kinder
  );
}

export function formatEuro(betrag: string | number): string {
  return `${Number(betrag).toFixed(2).replace(".", ",")} €`;
}
