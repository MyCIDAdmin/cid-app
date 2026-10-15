/** Rangliste der Regionen : Punkte pro Mitglied, Gesamtpunkte, Treffen und Abzeichen. */
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import type { RanglisteZeile } from "../../types/regionen";

export default function WettbewerbRangliste({ zeilen }: { zeilen: RanglisteZeile[] }) {
  const { t, i18n } = useTranslation("regionen");
  const zahl = (n: number) => n.toLocaleString(i18n.language, { maximumFractionDigits: 2 });
  if (zeilen.length === 0) {
    return <p className="text-sm text-text-tertiary">{t("wettbewerb.keine_regionen")}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-cid-lg bg-bg-primary shadow-sm">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <caption className="sr-only">{t("wettbewerb.rangliste")}</caption>
        <thead className="text-xs uppercase tracking-wide text-text-tertiary">
          <tr>
            <th scope="col" className="px-3 py-2">
              {t("wettbewerb.spalte_rang")}
            </th>
            <th scope="col" className="px-3 py-2">
              {t("wettbewerb.spalte_region")}
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              {t("wettbewerb.spalte_pro_mitglied")}
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              {t("wettbewerb.spalte_punkte")}
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              {t("wettbewerb.spalte_treffen")}
            </th>
            <th scope="col" className="px-3 py-2">
              {t("wettbewerb.spalte_abzeichen")}
            </th>
          </tr>
        </thead>
        <tbody>
          {zeilen.map((z) => (
            <tr key={z.region.slug} className="border-t border-text-tertiary/10">
              <td className="px-3 py-2 font-semibold tabular-nums text-text-primary">{z.rang}</td>
              <td className="px-3 py-2">
                <Link
                  to={`/regionen/${z.region.slug}`}
                  className="inline-flex items-center gap-2 font-medium text-text-primary hover:underline"
                >
                  <span
                    aria-hidden="true"
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: z.region.farbe }}
                  />
                  {z.region.name}
                </Link>
              </td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums text-text-primary">
                {zahl(z.punkte_pro_mitglied)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-text-secondary">
                {zahl(z.punkte)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-text-secondary">{z.treffen}</td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {z.abzeichen.map((a) => (
                    <span
                      key={a.key}
                      className="rounded-full bg-bg-secondary px-2 py-0.5 text-xs font-medium text-text-secondary"
                    >
                      {t(`wettbewerb.abzeichen.${a.key}`)}
                      {a.anzahl > 1 ? ` ×${a.anzahl}` : ""}
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
