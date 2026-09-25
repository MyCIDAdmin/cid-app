/**
 * Podium des résultats — mockup #vote-results-card / #results-list et #m-past-vote / #pv-results
 * (même structure de rendu réutilisée pour les deux, comme dans le mockup d'origine). Rang 1
 * mis en avant (bordure + fond `--cal`), libellé "★ Élu(e)".
 *
 * Gestion des égalités (bug rapporté en production, 2026-09) : `estGagnant` ne doit JAMAIS se
 * limiter à `index === 0` — avec un tri par nombre de voix, plusieurs options peuvent partager
 * le même score le plus élevé (ex. 2 listes à 1 voix chacune) et un simple index de tri choisit
 * arbitrairement laquelle apparaît en premier. Toutes les options à égalité avec le meilleur
 * score (> 0) sont donc marquées "Élu(e)", et leur rang affiché est également partagé (1, 1, 3 —
 * classement "1224", pas 1, 2, 3) plutôt que de laisser croire à un gagnant unique inexistant.
 *
 * Seuil de victoire (renommé/repensé le 2026-09-25, retour utilisateur — remplace l'ancien
 * "quorum" de PARTICIPATION, comparé avec >=) : `resultats.seuil_victoire_atteint`, déjà
 * calculé côté backend (voir services.calculer_resultats, comparaison STRICTE >, pas >=),
 * conditionne désormais `estGagnant` en plus de l'égalité — si un seuil est configuré et non
 * atteint, AUCUNE option n'est marquée "Élu(e)" et le vote est présenté comme non décidé
 * (une seule source de vérité pour "qui a gagné", jamais recalculée indépendamment ici).
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
  const seuilAtteintOuAbsent =
    resultats.seuil_victoire_requis === null || resultats.seuil_victoire_atteint;
  const nombreGagnants = seuilAtteintOuAbsent
    ? classement.filter((r) => r.nombre_voix > 0 && r.nombre_voix === meilleurScore).length
    : 0;
  const nonDecide = resultats.seuil_victoire_requis !== null && !resultats.seuil_victoire_atteint;

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
          {resultats.seuil_victoire_requis !== null ? (
            <span
              className={
                resultats.seuil_victoire_atteint
                  ? "text-status-successText"
                  : "text-status-dangerText"
              }
            >
              {resultats.seuil_victoire_atteint
                ? t("resultats.quote_atteint", { pct: resultats.seuil_victoire_requis })
                : t("resultats.quote_non_atteint", { pct: resultats.seuil_victoire_requis })}
            </span>
          ) : (
            t("resultats.pas_de_quote")
          )}
        </span>
      </div>

      <div className="space-y-2">
        {classement.map((r) => {
          const estGagnant =
            seuilAtteintOuAbsent && r.nombre_voix > 0 && r.nombre_voix === meilleurScore;
          // Classement "1224" : le rang affiché est le nombre d'options strictement devant
          // + 1, donc partagé entre ex-aequo (1, 1, 3) plutôt qu'un simple index+1 (1, 2, 3)
          // qui casserait artificiellement une égalité réelle.
          const rang = classement.filter((c) => c.nombre_voix > r.nombre_voix).length + 1;
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
                  {rang}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-text-primary">
                    {r.label}
                    {estGagnant && <span className="ml-1.5 text-ca">★ {t("resultats.elu")}</span>}
                  </div>
                  {r.candidats.length > 0 && (
                    <div className="mt-0.5 text-[11px] text-text-tertiary">
                      {t("resultats.composition_liste")} {r.candidats.join(", ")}
                    </div>
                  )}
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

      {nombreGagnants > 1 && (
        <p className="mt-2 rounded-cid bg-status-warningBg px-3 py-2 text-center text-[11px] text-status-warningText">
          ⚠ {t("resultats.egalite", { count: nombreGagnants })}
        </p>
      )}

      {nonDecide && (
        <p className="mt-2 rounded-cid bg-status-warningBg px-3 py-2 text-center text-[11px] text-status-warningText">
          ⚠ {t("resultats.non_decide", { pct: resultats.seuil_victoire_requis })}
        </p>
      )}

      <p className="mt-3 text-center text-[10px] text-text-tertiary">
        🔒 {t("resultats.footer_certifie")}
      </p>
    </div>
  );
}
