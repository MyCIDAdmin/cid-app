/** Fortschrittsleiste einer Bestellung: Bestellt → Bezahlt → Versandt → Geliefert. Abgebrochene
 * und erstattete Bestellungen zeigen stattdessen eine graue Leiste mit ihrem Status. */
import { useTranslation } from "react-i18next";

import type { StatutCommande } from "../../types/boutique";

const SCHRITTE = ["bestellt", "bezahlt", "versandt", "geliefert"] as const;

/** Index des aktuellen Schritts (0–3); 4 = alles erledigt. */
function aktuellerSchritt(statut: StatutCommande): number {
  switch (statut) {
    case "en_attente":
      return 0;
    case "confirmee":
    case "en_preparation":
      return 1;
    case "expediee":
      return 2;
    case "livree":
      return 4;
    default:
      return -1;
  }
}

export default function BestellFortschritt({ statut }: { statut: StatutCommande }) {
  const { t } = useTranslation("boutique");
  const jetzt = aktuellerSchritt(statut);
  const beendet = jetzt === -1;
  return (
    <ol
      aria-label={t("bestellung.fortschritt")}
      className="grid min-w-0 grid-cols-4 gap-1"
      data-statut={statut}
    >
      {SCHRITTE.map((s, i) => {
        const erledigt = !beendet && i < jetzt;
        const aktuell = !beendet && i === jetzt;
        return (
          <li key={s} className="min-w-0 text-center">
            <span
              className={`block h-1.5 rounded-full ${
                beendet
                  ? "bg-text-tertiary/20"
                  : erledigt || jetzt === 4
                    ? "bg-status-successText"
                    : aktuell
                      ? "bg-ca"
                      : "bg-text-tertiary/20"
              }`}
            />
            <span
              className={`mt-1 block truncate text-[10px] ${
                aktuell ? "font-bold text-text-primary" : "text-text-tertiary"
              }`}
              aria-current={aktuell ? "step" : undefined}
            >
              {beendet && i === 0 ? t(`statut_commande.${statut}`) : t(`bestellung.schritt.${s}`)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
