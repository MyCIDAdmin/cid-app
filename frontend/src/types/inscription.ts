/**
 * Types — validation des inscriptions par RH/Admin (AHM-48/AHM-50).
 */
import type { CursorPage } from "./membre";

export interface PendingRegistration {
  id: string;
  email: string;
  langue_preferee: "fr" | "de" | "ar";
  created_at: string;
  /** Historique (point 5, 2026-10-06) : décision et date de décision protocolée. */
  registration_decision: "en_attente" | "approuve" | "refuse";
  registration_decided_at: string | null;
  /** Depuis AHM-50 — viennent de la fiche Membre créée à l'inscription. */
  prenom: string;
  nom: string;
  ville: string;
}

export type PendingRegistrationsPage = CursorPage<PendingRegistration>;

/** Filtres/tri de GET /auth/pending-registrations/ (point 5, 2026-10-06). */
export interface RegistrationsFiltres {
  decision?: "" | "en_attente" | "approuve" | "refuse";
  q?: string;
  date_apres?: string;
  date_avant?: string;
  tri?: "date" | "-date" | "decision_date" | "-decision_date" | "email" | "-email";
}
