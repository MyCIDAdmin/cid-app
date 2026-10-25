/**
 * Statusanzeige einer Beitragsaktion : Badge „Dringend“, Frist (mit Resttagen), Fortschritt aus
 * den bezahlten Beiträgen. Wird in der Verwaltung, im Bezahlvorgang und auf der öffentlichen
 * Seite gleich verwendet.
 */
import { useTranslation } from "react-i18next";

import AnimatedProgress from "../ui/AnimatedProgress";
import { formatFrist, istDringlich, tageBisFrist } from "../../utils/aktionen";

export interface AktionStatusDaten {
  dringend: boolean;
  frist: string | null;
  abgelaufen: boolean;
  zielbetrag: string | null;
  gesammelt: string;
  beitragende: number;
  fortschritt: number | null;
}

function formatEuro(wert: string | number, sprache: string): string {
  return new Intl.NumberFormat(sprache.startsWith("fr") ? "fr-FR" : "de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(Number(wert));
}

export default function AktionStatus({
  aktion,
  kompakt = false,
}: {
  aktion: AktionStatusDaten;
  /** Ohne Fortschrittsbalken (z. B. in engen Tabellenzellen). */
  kompakt?: boolean;
}) {
  const { t, i18n } = useTranslation("cotisations");
  const dringend = istDringlich(aktion);
  const tage = tageBisFrist(aktion.frist);

  let fristText: string | null = null;
  if (aktion.frist) {
    if (aktion.abgelaufen)
      fristText = t("aktion.frist_abgelaufen", { datum: formatFrist(aktion.frist, i18n.language) });
    else if (tage === 0) fristText = t("aktion.frist_heute");
    else if (tage !== null && tage <= 3)
      fristText = t("aktion.frist_tage", {
        count: tage,
        datum: formatFrist(aktion.frist, i18n.language),
      });
    else fristText = t("aktion.frist_bis", { datum: formatFrist(aktion.frist, i18n.language) });
  }

  const hatZiel = aktion.zielbetrag !== null && aktion.fortschritt !== null;
  const ziel = hatZiel ? (aktion.fortschritt as number) : 0;

  return (
    <div className="space-y-1.5" data-testid="aktion-status">
      {(dringend || fristText || aktion.abgelaufen) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {dringend && (
            <span className="rounded-full bg-status-dangerBg px-2 py-0.5 text-[10px] font-bold uppercase text-status-dangerText">
              {t("aktion.badge_dringend")}
            </span>
          )}
          {aktion.abgelaufen && (
            <span className="rounded-full bg-bg-tertiary px-2 py-0.5 text-[10px] font-medium text-text-secondary">
              {t("aktion.badge_abgelaufen")}
            </span>
          )}
          {fristText && <span className="text-xs text-text-secondary">{fristText}</span>}
        </div>
      )}
      {!kompakt && hatZiel && (
        <div>
          <AnimatedProgress value={ziel} />
          <div className="mt-1 flex justify-between text-xs text-text-secondary">
            <span>
              {t("aktion.gesammelt_von", {
                summe: formatEuro(aktion.gesammelt, i18n.language),
                ziel: formatEuro(aktion.zielbetrag as string, i18n.language),
              })}
            </span>
            <span>{ziel} %</span>
          </div>
          {ziel >= 80 && ziel < 100 && (
            <p className="mt-1 text-xs font-medium text-ca">{t("aktion.fast_geschafft")}</p>
          )}
          {ziel >= 100 && (
            <p className="mt-1 text-xs font-medium text-ca">{t("aktion.ziel_erreicht")}</p>
          )}
        </div>
      )}
      {!kompakt && !hatZiel && aktion.beitragende > 0 && (
        <p className="text-xs text-text-secondary">
          {t("aktion.gesammelt_ohne_ziel", {
            summe: formatEuro(aktion.gesammelt, i18n.language),
            count: aktion.beitragende,
          })}
        </p>
      )}
    </div>
  );
}
