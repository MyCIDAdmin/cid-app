/**
 * Aktivität — Journal (Release 20) : durchsuchbares, schreibgeschütztes Protokoll mit Filtern,
 * Detailansicht je Eintrag und CSV-Export. Nur für den App-Admin.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { exportJournal } from "../../api/aktivitaet";
import { useAktionen, useJournal } from "../../hooks/useAktivitaet";
import type { Gewicht, JournalFilter } from "../../types/aktivitaet";
import { textIn, zeitpunkt } from "../../utils/aktivitaet";
import { declencherTelechargement } from "../../utils/telechargement";

const GEWICHT_STIL: Record<Gewicht, string> = {
  info: "bg-bg-tertiary text-text-secondary",
  warnung: "bg-status-warningBg text-status-warningText",
  wichtig: "bg-status-infoBg text-status-infoText",
};

const eingabe =
  "w-full rounded-cid-lg border border-text-tertiary/30 bg-bg-primary px-2 py-1 text-xs text-text-primary";

export default function JournalPanel({
  filter,
  setFilter,
}: {
  filter: JournalFilter;
  setFilter: (filter: JournalFilter) => void;
}) {
  const { t, i18n } = useTranslation("aktivitaet");
  const { data, isLoading, isError } = useJournal(filter);
  const { data: auswahl } = useAktionen();
  const [offen, setOffen] = useState<string | null>(null);
  const [exportFehler, setExportFehler] = useState(false);

  function aendern(teil: Partial<JournalFilter>) {
    setFilter({ ...filter, ...teil, seite: 1 });
  }

  async function exportieren() {
    setExportFehler(false);
    try {
      const { blob, nomFichier } = await exportJournal(filter);
      declencherTelechargement(blob, nomFichier);
    } catch {
      setExportFehler(true);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="text-[10px] uppercase text-text-tertiary">
          {t("journal.von")}
          <input
            type="date"
            className={eingabe}
            value={filter.von ?? ""}
            onChange={(e) => aendern({ von: e.target.value })}
          />
        </label>
        <label className="text-[10px] uppercase text-text-tertiary">
          {t("journal.bis")}
          <input
            type="date"
            className={eingabe}
            value={filter.bis ?? ""}
            onChange={(e) => aendern({ bis: e.target.value })}
          />
        </label>
        <label className="text-[10px] uppercase text-text-tertiary">
          {t("journal.kategorie")}
          <select
            className={eingabe}
            value={filter.kategorie ?? ""}
            onChange={(e) => aendern({ kategorie: e.target.value, aktion: "" })}
          >
            <option value="">{t("journal.alle")}</option>
            {auswahl?.kategorien.map((k) => (
              <option key={k.key} value={k.key}>
                {textIn(i18n.language, k.label)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[10px] uppercase text-text-tertiary">
          {t("journal.aktion")}
          <select
            className={eingabe}
            value={filter.aktion ?? ""}
            onChange={(e) => aendern({ aktion: e.target.value })}
          >
            <option value="">{t("journal.alle")}</option>
            {filter.aktion && !auswahl?.aktionen.some((a) => a.aktion === filter.aktion) && (
              <option value={filter.aktion}>{filter.aktion}</option>
            )}
            {auswahl?.aktionen
              .filter((a) => !filter.kategorie || a.kategorie === filter.kategorie)
              .map((a) => (
                <option key={a.aktion} value={a.aktion}>
                  {textIn(i18n.language, a.label)}
                </option>
              ))}
          </select>
        </label>
        <label className="text-[10px] uppercase text-text-tertiary">
          {t("journal.gewicht")}
          <select
            className={eingabe}
            value={filter.gewicht ?? ""}
            onChange={(e) => aendern({ gewicht: e.target.value })}
          >
            <option value="">{t("journal.alle")}</option>
            <option value="warnung">{t("journal.gewichte.warnung")}</option>
            <option value="wichtig">{t("journal.gewichte.wichtig")}</option>
          </select>
        </label>
        <label className="text-[10px] uppercase text-text-tertiary">
          {t("journal.person")}
          <input
            type="search"
            className={eingabe}
            value={filter.q ?? ""}
            placeholder={t("journal.person_platzhalter")}
            onChange={(e) => aendern({ q: e.target.value })}
          />
        </label>
        <label className="text-[10px] uppercase text-text-tertiary">
          {t("journal.ip")}
          <input
            type="search"
            className={eingabe}
            value={filter.ip ?? ""}
            onChange={(e) => aendern({ ip: e.target.value })}
          />
        </label>
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => setFilter({ seite: 1 })}
            className="rounded-cid-lg bg-bg-tertiary px-3 py-1 text-xs text-text-secondary"
          >
            {t("journal.zuruecksetzen")}
          </button>
          <button
            type="button"
            onClick={exportieren}
            className="rounded-cid-lg bg-ca px-3 py-1 text-xs font-medium text-white"
          >
            {t("journal.export")}
          </button>
        </div>
      </div>
      {exportFehler && (
        <p className="text-xs text-status-dangerText">{t("journal.export_fehler")}</p>
      )}

      {isLoading && <p className="text-sm text-text-tertiary">{t("chargement")}</p>}
      {isError && <p className="text-sm text-status-dangerText">{t("erreur_chargement")}</p>}

      {data && (
        <>
          <p className="text-xs text-text-tertiary">
            {t("journal.anzahl", { count: data.anzahl })}
          </p>
          <div className="overflow-x-auto rounded-cid-lg bg-bg-primary shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="text-text-tertiary">
                <tr>
                  <th className="px-3 py-2 font-normal">{t("journal.spalten.zeit")}</th>
                  <th className="px-3 py-2 font-normal">{t("journal.spalten.aktion")}</th>
                  <th className="px-3 py-2 font-normal">{t("journal.spalten.person")}</th>
                  <th className="px-3 py-2 font-normal">{t("journal.spalten.ip")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-text-tertiary/10">
                {data.ergebnisse.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-text-tertiary">
                      {t("journal.leer")}
                    </td>
                  </tr>
                )}
                {data.ergebnisse.map((e) => (
                  <tr
                    key={e.id}
                    onClick={() => setOffen(offen === e.id ? null : e.id)}
                    className="cursor-pointer align-top hover:bg-bg-secondary"
                  >
                    <td className="whitespace-nowrap px-3 py-2">
                      {zeitpunkt(e.zeit, i18n.language)}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 ${GEWICHT_STIL[e.gewicht]}`}>
                        {textIn(i18n.language, e.label)}
                      </span>
                      {offen === e.id && (
                        <dl className="mt-2 space-y-1 text-text-secondary">
                          <div>
                            <dt className="inline text-text-tertiary">
                              {t("journal.technisch")}:{" "}
                            </dt>
                            <dd className="inline font-mono">{e.aktion}</dd>
                          </div>
                          {e.geraet && (
                            <div>
                              <dt className="inline text-text-tertiary">{t("journal.geraet")}: </dt>
                              <dd className="inline">{e.geraet}</dd>
                            </div>
                          )}
                          {Object.keys(e.details).length > 0 && (
                            <pre className="whitespace-pre-wrap break-all rounded bg-bg-tertiary p-2 font-mono">
                              {JSON.stringify(e.details, null, 2)}
                            </pre>
                          )}
                        </dl>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {e.user ? (
                        <>
                          <div className="text-text-primary">{e.user.name}</div>
                          <div className="text-text-tertiary">{e.user.email}</div>
                        </>
                      ) : (
                        "–"
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono">{e.ip ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <button
              type="button"
              disabled={data.seite <= 1}
              onClick={() => setFilter({ ...filter, seite: data.seite - 1 })}
              className="rounded-cid-lg bg-bg-tertiary px-3 py-1 disabled:opacity-40"
            >
              {t("journal.zurueck")}
            </button>
            <span>{t("journal.seite", { seite: data.seite, seiten: data.seiten })}</span>
            <button
              type="button"
              disabled={data.seite >= data.seiten}
              onClick={() => setFilter({ ...filter, seite: data.seite + 1 })}
              className="rounded-cid-lg bg-bg-tertiary px-3 py-1 disabled:opacity-40"
            >
              {t("journal.weiter")}
            </button>
          </div>
          <p className="text-[10px] text-text-tertiary">
            {t("journal.aufbewahrung", {
              kurz:
                auswahl?.kategorien.find((k) => k.key === "anmeldung")?.aufbewahrung_tage ?? 180,
              lang: auswahl?.kategorien.find((k) => k.key === "rollen")?.aufbewahrung_tage ?? 730,
            })}
          </p>
        </>
      )}
    </div>
  );
}
