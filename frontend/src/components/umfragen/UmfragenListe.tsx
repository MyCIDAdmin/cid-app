/**
 * Tab „Umfragen“ der Seite „Quiz und Umfragen“ (Release 11): offene und beendete Umfragen.
 */
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useUmfragen } from "../../hooks/useUmfragen";
import { uebersetzt } from "../../utils/uebersetzung";
import { formatiereFrist } from "../../utils/umfragen";

export default function UmfragenListe() {
  const { t } = useTranslation("umfragen");
  const umfragen = useUmfragen();

  if (umfragen.isLoading) return <p className="text-sm text-text-tertiary">{t("laden")}</p>;
  if (umfragen.isError) {
    return <p className="text-sm text-status-dangerText">{t("fehler_laden")}</p>;
  }
  const liste = umfragen.data ?? [];
  if (liste.length === 0) return <p className="text-sm text-text-tertiary">{t("leer")}</p>;

  return (
    <ul className="space-y-2" data-testid="umfragen-liste">
      {liste.map((umfrage) => (
        <li key={umfrage.id}>
          <Link
            to={`/umfragen/${umfrage.id}`}
            className="flex gap-3 rounded-cid-lg bg-bg-primary p-3 shadow-sm hover:bg-bg-secondary"
          >
            {umfrage.bild && (
              <img
                src={umfrage.bild}
                alt=""
                className="h-16 w-16 shrink-0 rounded-cid object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-bold text-text-primary">
                  {uebersetzt(umfrage, "titel")}
                </span>
                <span className="flex gap-1 text-[10px] font-bold">
                  {!umfrage.veroeffentlicht && (
                    <span className="rounded bg-bg-secondary px-1.5 py-0.5 text-text-tertiary">
                      {t("status.entwurf")}
                    </span>
                  )}
                  {umfrage.teilgenommen && (
                    <span className="rounded bg-cal px-1.5 py-0.5 text-cad">
                      ✓ {t("status.teilgenommen")}
                    </span>
                  )}
                  <span
                    className={`rounded px-1.5 py-0.5 ${
                      umfrage.abgelaufen
                        ? "bg-bg-secondary text-text-tertiary"
                        : "bg-status-successBg text-status-successText"
                    }`}
                  >
                    {t(umfrage.abgelaufen ? "status.beendet" : "status.offen")}
                  </span>
                </span>
              </div>
              {umfrage.beschreibung && (
                <p className="line-clamp-2 text-xs text-text-secondary">{umfrage.beschreibung}</p>
              )}
              <div className="mt-1 text-[11px] text-text-tertiary">
                {t("bis", { datum: formatiereFrist(umfrage.frist) })} ·{" "}
                {t(umfrage.anonym ? "anonym" : "namentlich")}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
