/**
 * Logik zu „Nächster Schritt“ auf „Meine Mitgliedschaft“ (Release 2026.11) : welcher Hinweis passt
 * zum Stand der Mitgliedschaft. Die Darstellung steht in `NaechsterSchritt.tsx`.
 */
import type { Souscription } from "../../types/adhesion";

export type SchrittArt =
  "ok" | "bald" | "nachweis" | "zahlung" | "abgelehnt" | "beitreten" | "wieder";

export type SchrittZiel = "angebote" | "nachweis" | "zahlung";

/** Tage vor Ende der Kampagne, ab denen „läuft bald ab“ erscheint. */
export const TAGE_BALD = 30;

export function schrittArt({
  hatKampagne,
  souscription,
  tage,
}: {
  hatKampagne: boolean;
  souscription: Pick<Souscription, "statut"> | undefined;
  tage: number | null;
}): SchrittArt | null {
  if (!hatKampagne) return null;
  if (!souscription) return "beitreten";
  switch (souscription.statut) {
    case "payee":
      return tage != null && tage <= TAGE_BALD ? "bald" : "ok";
    case "en_attente_justificatif":
      return "nachweis";
    case "rabais_refuse":
      return "abgelehnt";
    case "annulee":
    case "expiree":
      return "wieder";
    default:
      return "zahlung"; // brouillon, en_attente_paiement
  }
}
