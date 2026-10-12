/**
 * „Exklusiv nur für Mitglieder“ (Release 7, 2026-10-12): Badge für Kachel/Detailseite und
 * Hinweis, der Bestell-/Reservierungselemente ersetzt, solange `produit.zugang_gesperrt` gilt.
 * Die verbindliche Sperre liegt im Backend (reservierungen.pruefe_zugang) — das hier ist nur
 * die Anzeige.
 */
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useAuthStore } from "../../store/authStore";

export function ExklusivBadge({ className = "" }: { className?: string }) {
  const { t } = useTranslation("boutique");
  return (
    <span
      className={`rounded-full bg-status-dangerText px-2 py-0.5 text-[9px] font-bold text-white shadow ${className}`}
    >
      👑 {t("catalogue.badge_exklusiv")}
    </span>
  );
}

export function ExklusivHinweis() {
  const { t } = useTranslation("boutique");
  const angemeldet = useAuthStore((s) => s.isAuthenticated);
  return (
    <div
      role="note"
      className="mt-auto rounded-cid border border-status-dangerText/30 bg-status-dangerBg px-3 py-2 text-xs text-status-dangerText"
    >
      <p className="font-medium">👑 {t("catalogue.exklusiv_hinweis")}</p>
      {angemeldet ? (
        <p className="mt-0.5">{t("catalogue.exklusiv_kein_mitglied")}</p>
      ) : (
        <Link to="/login" className="mt-0.5 inline-block font-medium underline">
          {t("catalogue.exklusiv_login")}
        </Link>
      )}
    </div>
  );
}
