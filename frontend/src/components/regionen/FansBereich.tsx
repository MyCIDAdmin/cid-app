/**
 * Fans und ihre Aktivitäten in einer Region (Release 31) — für Verantwortliche der Region und das
 * Büro. „Fan“ ist, wer sich für ein Treffen der Region angemeldet hat (Mitglied oder nicht).
 * Es werden nur Name und Zahlen gezeigt, keine Kontaktdaten.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useFanDetail, useFans } from "../../hooks/useRegionen";
import { formatDatum } from "../../utils/regionen";

const SEITE = 25;
const FELD =
  "rounded-cid border border-text-tertiary/20 bg-bg-secondary px-3 py-2 text-sm text-text-primary";

function Aktivitaeten({ slug, userId }: { slug: string; userId: string }) {
  const { t, i18n } = useTranslation("regionen");
  const { data, isLoading, isError } = useFanDetail(slug, userId);
  if (isLoading) return <p className="text-xs text-text-tertiary">{t("laden")}</p>;
  if (isError || !data) {
    return <p className="text-xs text-status-dangerText">{t("fans.fehler_detail")}</p>;
  }
  return (
    <div className="flex flex-col gap-1 text-xs text-text-secondary">
      <p>{t("fans.reaktionen_zahl", { count: data.reaktionen })}</p>
      <ul className="flex flex-col gap-0.5">
        {data.veranstaltungen.map((v) => (
          <li key={v.id}>
            <span className="font-medium text-text-primary">{v.titel}</span> ·{" "}
            {formatDatum(v.datum, i18n.language)} ·{" "}
            {v.anwesend
              ? t("fans.war_anwesend")
              : v.abgeschlossen
                ? t("fans.nicht_anwesend")
                : t("fans.angemeldet")}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function FansBereich({ slug }: { slug: string }) {
  const { t, i18n } = useTranslation("regionen");
  const [suche, setSuche] = useState("");
  const [art, setArt] = useState("");
  const [limit, setLimit] = useState(SEITE);
  const [offen, setOffen] = useState<string | null>(null);
  const { data, isLoading, isError } = useFans({ slug, q: suche.trim(), art, limit, aktiv: true });

  return (
    <section className="flex flex-col gap-3 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-text-primary">{t("fans.titel")}</h2>
        <p className="text-xs text-text-tertiary">{t("fans.hinweis")}</p>
      </div>

      {data && (
        <p className="text-sm text-text-secondary">
          {t("fans.zusammenfassung", {
            gesamt: data.gesamt,
            mitglieder: data.mitglieder,
            fans: data.fans,
          })}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          className={`${FELD} min-w-0 flex-1`}
          aria-label={t("fans.suche")}
          placeholder={t("fans.suche")}
          value={suche}
          onChange={(e) => {
            setSuche(e.target.value);
            setLimit(SEITE);
          }}
        />
        <select
          className={FELD}
          aria-label={t("fans.art")}
          value={art}
          onChange={(e) => {
            setArt(e.target.value);
            setLimit(SEITE);
          }}
        >
          <option value="">{t("fans.art_alle")}</option>
          <option value="mitglied">{t("fans.art_mitglied")}</option>
          <option value="fan">{t("fans.art_fan")}</option>
        </select>
      </div>

      {isLoading && <p className="text-sm text-text-tertiary">{t("laden")}</p>}
      {isError && <p className="text-sm text-status-dangerText">{t("fans.fehler")}</p>}
      {data && data.ergebnisse.length === 0 && (
        <p className="text-sm text-text-tertiary">{t("fans.leer")}</p>
      )}

      {data && data.ergebnisse.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-text-tertiary">
              <tr>
                <th scope="col" className="py-2 pr-3">
                  {t("fans.spalte_name")}
                </th>
                <th scope="col" className="py-2 pr-3">
                  {t("fans.spalte_art")}
                </th>
                <th scope="col" className="py-2 pr-3 text-right">
                  {t("fans.spalte_anmeldungen")}
                </th>
                <th scope="col" className="py-2 pr-3 text-right">
                  {t("fans.spalte_teilnahmen")}
                </th>
                <th scope="col" className="py-2 pr-3 text-right">
                  {t("fans.spalte_reaktionen")}
                </th>
                <th scope="col" className="py-2">
                  {t("fans.spalte_letzte")}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.ergebnisse.map((f) => (
                <tr key={f.user} className="border-t border-text-tertiary/10 align-top">
                  <td className="py-2 pr-3">
                    <button
                      type="button"
                      aria-expanded={offen === f.user}
                      onClick={() => setOffen(offen === f.user ? null : f.user)}
                      className="text-left font-medium text-text-primary hover:underline"
                    >
                      {f.name || t("fans.ohne_name")}
                    </button>
                    {offen === f.user && (
                      <div className="mt-2">
                        <Aktivitaeten slug={slug} userId={f.user} />
                      </div>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-text-secondary">
                    {t(f.art === "mitglied" ? "fans.art_mitglied" : "fans.art_fan")}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{f.anmeldungen}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{f.teilnahmen}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{f.reaktionen}</td>
                  <td className="py-2 text-text-secondary">
                    {new Date(f.letzte_aktivitaet).toLocaleDateString(i18n.language)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.gesamt > data.ergebnisse.length && (
        <div>
          <button
            type="button"
            onClick={() => setLimit((n) => n + SEITE)}
            className="rounded-cid px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-bg-secondary"
          >
            {t("fans.mehr")}
          </button>
        </div>
      )}
    </section>
  );
}
