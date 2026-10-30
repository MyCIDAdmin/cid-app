/** Saisonübersicht : alle kommenden Spiele (Heim und Auswärts) und die Reisen dazu. */
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useSaison } from "../../hooks/useReisen";
import { zeitKurz } from "../../utils/reisen";
import { KARTE, KNOPF_LEISE } from "./ui";

export default function SaisonTab() {
  const { t, i18n } = useTranslation("reisen");
  const q = useSaison();
  const spiele = q.data ?? [];
  return (
    <div className="space-y-3">
      {q.isLoading && <p className="text-sm text-text-tertiary">{t("laden")}</p>}
      {!q.isLoading && spiele.length === 0 && (
        <p className="text-sm text-text-tertiary">{t("saison.leer")}</p>
      )}
      <ul className="space-y-2">
        {spiele.map((s) => (
          <li
            key={s.rencontre}
            className={`${KARTE} space-y-1`}
            data-testid={`saison-${s.rencontre}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">
                  {s.gegner}{" "}
                  <span className="ml-1 rounded-full bg-bg-tertiary px-2 py-0.5 align-middle text-[11px] font-normal text-text-secondary">
                    {s.heim ? t("saison.heim") : t("saison.auswaerts")}
                  </span>
                </p>
                <p className="text-xs text-text-secondary">
                  {s.competition} · {zeitKurz(s.datum, i18n.language)}
                </p>
              </div>
              <Link to={`/reisen/neu?rencontre=${s.rencontre}`} className={KNOPF_LEISE}>
                {t("saison.reise_planen")}
              </Link>
            </div>
            {s.reisen.length === 0 ? (
              <p className="text-xs text-text-tertiary">{t("saison.keine_reise")}</p>
            ) : (
              <ul className="space-y-0.5">
                {s.reisen.map((r) => (
                  <li key={r.id} className="text-xs">
                    <Link to={`/reisen/${r.id}`} className="text-ca underline">
                      {r.titel}
                    </Link>{" "}
                    · {t("liste.zaehler", { dabei: r.dabei, interessiert: r.interessiert })}
                    {r.mein_status && ` · ${t(`status.${r.mein_status}`)}`}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
