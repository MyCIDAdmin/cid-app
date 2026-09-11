/**
 * Types — validation des inscriptions par RH/Admin (AHM-48/AHM-50).
 */
import type { CursorPage } from "./membre";

export interface PendingRegistration {
  id: string;
  email: string;
  langue_preferee: "fr" | "de" | "ar";
  created_at: string;
  /** Depuis AHM-50 — viennent de la fiche Membre créée à l'inscription. */
  prenom: string;
  nom: string;
  ville: string;
}

export type PendingRegistrationsPage = CursorPage<PendingRegistration>;
