/**
 * Podium des résultats — mockup #vote-results-card / #results-list et #m-past-vote / #pv-results
 * (même structure de rendu réutilisée pour les deux, comme dans le mockup d'origine). Rang 1
 * mis en avant (bordure + fond `--cal`), libellé "★ Élu(e)".
 */
import { useTranslation } from "react-i18next";

import type { Resultats } from "../../types/vote";

interface ResultatsPodiumProps {
  resultats: Resultats;
}

export default function ResultatsPodium({ resultats }: ResultatsPodiumProps) {
  const { t } = useTranslation("vote");
  const classement = [...resultats.resultats].sort((a, b) => b.nombre_voix - a.nombre_voix);
  const meilleurScore = classement[0]?.nombre_voix ?? 0;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-text-tertiary">
        <span>
          {t("resultats.total_participants", {
            count: resultats.total_participants,
            total: resultats.total_eligibles,
          })}
        </span>
        <span>
          {t("resultats.taux_participation", { taux: resultats.taux_participation })} ·{" "}
          {resultats.quorum_requis !== null ? (
            <span
              className={
                resultats.quorum_atteint ? "text-status-successText" : "text-status-dangerText"
              }
            >
              {resultats.quorum_atteint
                ? t("resultats.quorum_atteint", { pct: resultats.quorum_requis })
                : t("resultats.quorum_non_atteint", { pct: resultats.quorum_requis })}
            </span>
          ) : (
            t("resultats.pas_de_quorum")
          )}
        </span>
      </div>

      <div className="space-y-2">
        {classement.map((r, index) => {
          const estGagnant = index === 0 && r.nombre_voix > 0 && r.nombre_voix === meilleurScore;
          return (
            <div
              key={r.option_id}
              className={`rounded-cid p-2.5 ${
                estGagnant ? "border-[1.5px] border-ca bg-cal/40" : "border border-text-tertiary/15"
              }`}
            >
              <div className="mb-1.5 flex items-center gap-2.5">
                <div
                  className={`w-7 text-center text-lg font-black ${estGagnant ? "text-ca" : "text-text-tertiary"}`}
                >
                  {index + 1}
                </div>
                <div className="flex-1 text-sm font-semibold text-text-primary">
                  {r.label}
                  {estGagnant && <span className="ml-1.5 text-ca">★ {t("resultats.elu")}</span>}
                </div>
                <div className="text-right">
                  <div
                    className={`text-lg font-extrabold ${estGagnant ? "text-ca" : "text-text-primary"}`}
                  >
                    {r.pct}%
                  </div>
                  <div className="text-[10px] text-text-tertiary">
                    {t("resultats.nombre_voix", { count: r.nombre_voix })}
                  </div>
                </div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-bg-tertiary">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${estGagnant ? "bg-ca" : "bg-text-tertiary"}`}
                  style={{ width: `${r.pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-center text-[10px] text-text-tertiary">
        🔒 {t("resultats.footer_certifie")}
      </p>
    </div>
  );
}
