/** Büro : Korrekturbuchung mit Begründung und das Punkte-Journal (jede Änderung bleibt sichtbar). */
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { useJournal, useKorrekturBuchen } from "../../hooks/useRegionen";
import type { RanglisteZeile, WettbewerbSaison } from "../../types/regionen";
import { extractApiErrorMessage } from "../../utils/apiError";

const FELD =
  "w-full rounded-cid border border-text-tertiary/20 bg-bg-secondary px-3 py-2 text-sm text-text-primary";
const SEITE = 25;

export default function WettbewerbBuero({
  saison,
  regionen,
}: {
  saison: WettbewerbSaison;
  regionen: RanglisteZeile["region"][];
}) {
  const { t, i18n } = useTranslation("regionen");
  const buchen = useKorrekturBuchen();
  const [anzahl, setAnzahl] = useState(SEITE);
  const [region, setRegion] = useState("");
  const [punkte, setPunkte] = useState("");
  const [begruendung, setBegruendung] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [gebucht, setGebucht] = useState(false);
  const journal = useJournal({ saison: saison.id, offset: 0, limit: anzahl, aktiv: true });

  const wert = Number(punkte);
  const gueltig =
    region && Number.isInteger(wert) && wert !== 0 && Math.abs(wert) <= 1000 && begruendung.trim();

  function senden(e: FormEvent) {
    e.preventDefault();
    if (!gueltig) return;
    setFehler(null);
    setGebucht(false);
    buchen.mutate(
      { region, punkte: wert, begruendung: begruendung.trim(), saison: saison.id },
      {
        onSuccess: () => {
          setPunkte("");
          setBegruendung("");
          setGebucht(true);
        },
        onError: (err) => setFehler(extractApiErrorMessage(err, t("fehler_speichern"))),
      },
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
      <h2 className="text-base font-semibold text-text-primary">{t("wettbewerb.buero_titel")}</h2>

      {saison.eingefroren ? (
        <p className="text-sm text-text-secondary">{t("wettbewerb.eingefroren_hinweis")}</p>
      ) : (
        <form onSubmit={senden} className="flex flex-col gap-2">
          <p className="text-sm text-text-secondary">{t("wettbewerb.korrektur_hinweis")}</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_8rem]">
            <select
              className={FELD}
              aria-label={t("wettbewerb.korrektur_region")}
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            >
              <option value="">{t("wettbewerb.korrektur_region")}</option>
              {regionen.map((r) => (
                <option key={r.slug} value={r.slug}>
                  {r.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              step={1}
              min={-1000}
              max={1000}
              className={FELD}
              aria-label={t("wettbewerb.korrektur_punkte")}
              placeholder={t("wettbewerb.korrektur_punkte")}
              value={punkte}
              onChange={(e) => setPunkte(e.target.value)}
            />
          </div>
          <input
            className={FELD}
            aria-label={t("wettbewerb.korrektur_begruendung")}
            placeholder={t("wettbewerb.korrektur_begruendung")}
            maxLength={300}
            value={begruendung}
            onChange={(e) => setBegruendung(e.target.value)}
          />
          {fehler && <p className="text-sm text-status-dangerText">{fehler}</p>}
          {gebucht && <p className="text-sm text-text-secondary">{t("wettbewerb.gebucht")}</p>}
          <div>
            <button
              type="submit"
              disabled={!gueltig || buchen.isPending}
              className="rounded-cid bg-ca px-4 py-2 text-sm font-medium text-white hover:bg-cad disabled:opacity-50"
            >
              {t("wettbewerb.korrektur_buchen")}
            </button>
          </div>
        </form>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-text-primary">{t("wettbewerb.journal")}</h3>
        {journal.isLoading && <p className="text-sm text-text-tertiary">{t("laden")}</p>}
        {journal.isError && (
          <p className="text-sm text-status-dangerText">{t("wettbewerb.fehler_journal")}</p>
        )}
        {journal.data && journal.data.ergebnisse.length === 0 && (
          <p className="text-sm text-text-tertiary">{t("wettbewerb.journal_leer")}</p>
        )}
        {journal.data && journal.data.ergebnisse.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <tbody>
                {journal.data.ergebnisse.map((e) => (
                  <tr key={e.id} className="border-t border-text-tertiary/10 align-top">
                    <td className="py-2 pr-3 text-xs text-text-tertiary">
                      {new Date(e.erstellt_am).toLocaleDateString(i18n.language)}
                    </td>
                    <td className="py-2 pr-3 font-medium text-text-primary">{e.region.name}</td>
                    <td className="py-2 pr-3 text-right font-semibold tabular-nums text-text-primary">
                      {e.punkte > 0 ? `+${e.punkte}` : e.punkte}
                    </td>
                    <td className="py-2 text-text-secondary">
                      {t(`wettbewerb.grund.${e.grund}`)}
                      {e.veranstaltung ? ` · ${e.veranstaltung.titel}` : ""}
                      {e.begruendung ? ` — ${e.begruendung}` : ""}
                      {e.von ? ` (${e.von})` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {journal.data && journal.data.gesamt > journal.data.ergebnisse.length && (
          <button
            type="button"
            onClick={() => setAnzahl((n) => n + SEITE)}
            className="mt-2 rounded-cid px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-bg-secondary"
          >
            {t("wettbewerb.mehr")}
          </button>
        )}
      </div>
    </section>
  );
}
