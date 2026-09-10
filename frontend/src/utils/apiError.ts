/**
 * Extrait un message lisible depuis une erreur Axios renvoyée par l'API
 * (format uniforme backend : { code, message, details } — voir
 * apps.accounts.exceptions.cid_exception_handler, TDD §2.3).
 */
import { isAxiosError } from "axios";

interface ApiErrorBody {
  code?: string;
  message?: string;
  details?: unknown;
}

function firstDetailMessage(details: unknown): string | null {
  if (!details) return null;
  if (Array.isArray(details) && details.length > 0) return String(details[0]);
  if (typeof details === "object") {
    for (const value of Object.values(details as Record<string, unknown>)) {
      if (Array.isArray(value) && value.length > 0) return String(value[0]);
      if (typeof value === "string") return value;
    }
  }
  return null;
}

export function extractApiErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError<ApiErrorBody>(error) && error.response?.data) {
    const { message, details } = error.response.data;
    return firstDetailMessage(details) ?? message ?? fallback;
  }
  return fallback;
}
