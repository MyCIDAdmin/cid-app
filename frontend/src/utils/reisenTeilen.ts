/**
 * Teilen-Button im Kopf der Reise (2026-10-30). Welche Adresse geteilt wird, hängt davon ab, wer
 * die Reise sehen darf :
 *  - öffentliche Vorschau an (und Reise nicht nur für Eingeladene) : die öffentliche Vorschauseite
 *    (ohne Anmeldung sichtbar, nie Namen) ;
 *  - Reise nur für Eingeladene : der Einladungslink — nur wer ihn kennt (Organisation), sonst
 *    kein Button ;
 *  - sonst : die Adresse der Reise in der App (Mitglieder/Konto melden sich an).
 */
import { teilenUrlDerReise } from "../api/reisen";
import type { ReiseDetail } from "../types/reisen";

export function teilenZiel(
  reise: Pick<ReiseDetail, "id" | "sichtbarkeit" | "vorschau_oeffentlich" | "einladungs_token">,
  origin: string = window.location.origin,
): { path: string; url?: string } | null {
  if (reise.sichtbarkeit === "eingeladen") {
    return reise.einladungs_token
      ? { path: `/reisen/einladung/${reise.einladungs_token}`, url: undefined }
      : null;
  }
  if (reise.vorschau_oeffentlich) {
    return { path: `/reise/${reise.id}`, url: teilenUrlDerReise(reise.id) };
  }
  return { path: `/reisen/${reise.id}`, url: `${origin}/reisen/${reise.id}` };
}
