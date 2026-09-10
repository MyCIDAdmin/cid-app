/**
 * Types — validation des inscriptions par RH/Admin (AHM-48).
 */
import type { CursorPage } from "./membre";

export interface PendingRegistration {
  id: string;
  email: string;
  langue_preferee: "fr" | "de" | "ar";
  created_at: string;
}

export type PendingRegistrationsPage = CursorPage<PendingRegistration>;
