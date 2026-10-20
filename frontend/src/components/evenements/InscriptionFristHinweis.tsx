/**
 * Zusatzzeile unter einer Anmeldung (2026-10-20): Zahlungsfrist bzw. Platz auf der Warteliste.
 * Die Frist setzt der Server (zentral einstellbar, Standard 2 Tage) ; läuft sie ab, wird die
 * Anmeldung storniert und die Warteliste rückt nach.
 */
import { useTranslation } from "react-i18next";

import type { Inscription } from "../../types/evenements";

function formatFrist(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function InscriptionFristHinweis({ inscription }: { inscription: Inscription }) {
  const { t } = useTranslation("evenements");
  if (inscription.statut === "liste_attente") {
    return (
      <div className="mt-1 text-xs text-status-infoText">
        {t("warteliste_position", { position: inscription.warteliste_position ?? 1 })}
      </div>
    );
  }
  if (inscription.statut === "en_attente_paiement" && inscription.zahlungsfrist_bis) {
    return (
      <div className="mt-1 text-xs text-status-warningText">
        {t("zahlungsfrist_hinweis", { datum: formatFrist(inscription.zahlungsfrist_bis) })}
      </div>
    );
  }
  return null;
}
