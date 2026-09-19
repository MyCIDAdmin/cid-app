/**
 * Activation/désactivation des emails de notification, par module (ajoutée le 2026-09-19,
 * demande utilisateur : "Die Mail benachrichtigung muss vom App Admin verwaltbar sein. Es muss
 * möglich sein für Funktionalitäten die Mail benachtigung einzustellen oder zu aktivieren").
 * Granularité PAR MODULE (pas par type de notification individuel), décision actée avec
 * l'utilisateur (AskUserQuestion, "Pro Modul"). Réservée à l'Administrateur App, même gate que
 * ParametresNotificationPermission côté API.
 *
 * Ne désactive jamais les notifications in-app correspondantes (toujours créées, voir la cloche
 * de notifications) — seul l'envoi d'email est concerné, voir le texte d'introduction de la page.
 */
import { useTranslation } from "react-i18next";

import {
  useModifierParametresNotification,
  useParametresNotification,
} from "../../hooks/useNotifications";
import { MODULES_NOTIFIABLES } from "../../types/notification";
import type { ModuleNotifiable } from "../../types/notification";
import { extractApiErrorMessage } from "../../utils/apiError";

export default function ParametresNotificationPage() {
  const { t } = useTranslation("notifications");
  const { data, isLoading, isError } = useParametresNotification();
  const modifierMutation = useModifierParametresNotification();

  function toggleModule(module: ModuleNotifiable, valeurActuelle: boolean) {
    modifierMutation.mutate({ [`email_${module}`]: !valeurActuelle });
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-text-primary">{t("parametres.titre")}</h1>
      <p className="mb-4 text-sm text-text-secondary">{t("parametres.description")}</p>

      {isLoading && <p className="text-sm text-text-tertiary">{t("parametres.chargement")}</p>}
      {isError && (
        <p className="text-sm text-status-dangerText">{t("parametres.erreur_chargement")}</p>
      )}
      {modifierMutation.isError && (
        <p className="mb-3 text-sm text-status-dangerText">
          {extractApiErrorMessage(modifierMutation.error, t("parametres.erreur_action"))}
        </p>
      )}

      {data && (
        <div className="divide-y divide-text-tertiary/10 rounded-cid-lg bg-bg-primary shadow-sm">
          {MODULES_NOTIFIABLES.map((module) => {
            const champ = `email_${module}` as const;
            const actif = data[champ];
            return (
              <div key={module} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-text-primary">
                    {t(`parametres.module.${module}`)}
                  </div>
                  <div className="text-xs text-text-tertiary">
                    {t(`parametres.module_description.${module}`)}
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={actif}
                  aria-label={t(`parametres.module.${module}`)}
                  disabled={modifierMutation.isPending}
                  onClick={() => toggleModule(module, actif)}
                  className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-40 ${
                    actif ? "border-ca bg-ca" : "border-text-tertiary bg-bg-tertiary"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                      actif ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
