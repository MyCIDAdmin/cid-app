/**
 * Cloche de notifications du layout (mockup topbar, #notif-panel, Phase 2B —
 * apps.notifications). Affiche le compteur non-lues (polling léger, voir useNonLuesCount) et,
 * au clic, un panneau déroulant listant les dernières notifications ; cliquer sur une
 * notification la marque lue et navigue vers `lien` si renseigné.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import {
  useMarquerLue,
  useNonLuesCount,
  useNotifications,
  useToutMarquerLu,
} from "../../hooks/useNotifications";
import type { Notification } from "../../types/notification";

function formatRelatif(
  iso: string,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return t("cloche.a_instant");
  if (minutes < 60) return t("cloche.il_y_a_minutes", { count: minutes });
  const heures = Math.floor(minutes / 60);
  if (heures < 24) return t("cloche.il_y_a_heures", { count: heures });
  return new Date(iso).toLocaleDateString();
}

export default function NotificationBell() {
  const { t } = useTranslation("notifications");
  const navigate = useNavigate();
  const [ouvert, setOuvert] = useState(false);
  const panneauRef = useRef<HTMLDivElement>(null);

  const nonLuesCount = useNonLuesCount();
  const notificationsQuery = useNotifications();
  const marquerLueMutation = useMarquerLue();
  const toutMarquerLuMutation = useToutMarquerLu();

  useEffect(() => {
    function handleClickExterieur(e: MouseEvent) {
      if (panneauRef.current && !panneauRef.current.contains(e.target as Node)) {
        setOuvert(false);
      }
    }
    if (ouvert) document.addEventListener("mousedown", handleClickExterieur);
    return () => document.removeEventListener("mousedown", handleClickExterieur);
  }, [ouvert]);

  function handleClicNotification(notification: Notification) {
    if (!notification.lu) marquerLueMutation.mutate(notification.id);
    setOuvert(false);
    if (notification.lien) navigate(notification.lien);
  }

  const count = nonLuesCount.data?.count ?? 0;

  return (
    <div ref={panneauRef} className="relative">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-label={t("cloche.aria_label")}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-text-secondary hover:bg-bg-tertiary"
      >
        🔔
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-ca text-[9px] font-bold text-white">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {ouvert && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-cid-lg bg-bg-primary shadow-xl">
          <div className="flex items-center justify-between border-b border-text-tertiary/20 px-3 py-2">
            <span className="text-sm font-bold text-text-primary">{t("cloche.titre")}</span>
            <button
              type="button"
              onClick={() => toutMarquerLuMutation.mutate()}
              disabled={toutMarquerLuMutation.isPending || count === 0}
              className="text-xs text-ca hover:underline disabled:opacity-40"
            >
              {t("cloche.tout_lire")}
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notificationsQuery.isLoading && (
              <p className="p-3 text-xs text-text-tertiary">{t("cloche.chargement")}</p>
            )}
            {notificationsQuery.data && notificationsQuery.data.results.length === 0 && (
              <p className="p-3 text-xs text-text-tertiary">{t("cloche.aucune")}</p>
            )}
            {notificationsQuery.data?.results.map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => handleClicNotification(notification)}
                className={`block w-full border-b border-text-tertiary/10 px-3 py-2 text-left last:border-0 hover:bg-bg-tertiary ${
                  notification.lu ? "" : "bg-cal/20"
                }`}
              >
                <div className="text-xs font-semibold text-text-primary">{notification.titre}</div>
                <div className="text-xs text-text-secondary">{notification.message}</div>
                <div className="mt-0.5 text-[10px] text-text-tertiary">
                  {formatRelatif(notification.created_at, t)}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
