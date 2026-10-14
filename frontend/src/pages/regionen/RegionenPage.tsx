/**
 * Regionen (Release 26) : Übersicht aller aktiven Regionen. Offen für jedes Konto (auch Fans ohne
 * Mitgliedschaft, siehe VISIBILITE_NON_MEMBRE_DEFAUT) ; das Backend liefert nur öffentliche Daten.
 */
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import RegionBild from "../../components/regionen/RegionBild";
import { useRegionen } from "../../hooks/useRegionen";
import { beschreibungIn } from "../../utils/regionen";

export default function RegionenPage() {
  const { t, i18n } = useTranslation("regionen");
  const { data, isLoading, isError } = useRegionen();

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-text-primary">{t("titel")}</h1>
      <p className="mb-4 text-sm text-text-secondary">{t("einleitung")}</p>

      {isLoading && <p className="text-sm text-text-tertiary">{t("laden")}</p>}
      {isError && <p className="text-sm text-status-dangerText">{t("fehler_laden")}</p>}

      {data && data.ohne_region && (
        <p className="mb-4 rounded-cid bg-bg-secondary px-3 py-2 text-sm text-text-secondary">
          {t("ohne_region_hinweis")}
        </p>
      )}
      {data && data.ergebnisse.length === 0 && (
        <p className="text-sm text-text-tertiary">{t("keine_regionen")}</p>
      )}

      {data && data.ergebnisse.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.ergebnisse.map((region) => {
            const text = beschreibungIn(i18n.language, region.beschreibung);
            return (
              <li key={region.id}>
                <Link
                  to={`/regionen/${region.slug}`}
                  className="block h-full overflow-hidden rounded-cid-lg bg-bg-primary shadow-sm hover:shadow-md"
                >
                  <RegionBild region={region} />
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="truncate text-base font-semibold text-text-primary">
                        {region.name}
                      </h2>
                      {region.meine_region && (
                        <span className="shrink-0 rounded-full bg-bg-secondary px-2 py-0.5 text-xs font-semibold text-text-secondary">
                          {t("meine_region")}
                        </span>
                      )}
                    </div>
                    {text && (
                      <p className="mt-1 line-clamp-2 text-sm text-text-secondary">{text}</p>
                    )}
                    <p className="mt-2 text-xs text-text-tertiary">
                      {t("mitglieder_zahl", { count: region.mitglieder })} ·{" "}
                      {t("verantwortliche_zahl", { count: region.verantwortliche.length })}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
