/**
 * Reporting „Wer kann wo helfen?“ (Release 9, ab Rolle RH) — Fähigkeiten-Datenbank im Modul
 * Mitglieder: Fähigkeiten nach Kategorie mit der Zahl der Mitglieder, aufklappbar mit Namen,
 * Kontakt und Anmerkung. Filter (Suche, Kategorie, Fähigkeit, Status) und Excel-Export.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { exportFaehigkeitenBericht } from "../../api/faehigkeiten";
import {
  useFaehigkeitenBericht,
  useFaehigkeitenKatalog,
  useLoescheFaehigkeit,
} from "../../hooks/useFaehigkeiten";
import { FAEHIGKEIT_KATEGORIEN, type FaehigkeitenFilter } from "../../types/faehigkeiten";
import { STATUTS_MEMBRE } from "../../types/membre";
import { extractApiErrorMessage } from "../../utils/apiError";
import { declencherTelechargement } from "../../utils/telechargement";
import StatutBadge from "../ui/StatutBadge";
import { useFaehigkeitLabel } from "../../utils/faehigkeitLabel";

const FELD = "rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm";
const LABEL = "mb-1 block text-[10px] uppercase text-text-tertiary";
const START: FaehigkeitenFilter = { q: "", kategorie: "", faehigkeit: "", statut: "", alle: false };

export default function FaehigkeitenReportingTab() {
  const { t } = useTranslation("membres");
  const faehigkeitLabel = useFaehigkeitLabel();
  const [filter, setFilter] = useState<FaehigkeitenFilter>(START);
  const bericht = useFaehigkeitenBericht(filter);
  const katalog = useFaehigkeitenKatalog();
  const loeschen = useLoescheFaehigkeit();
  const [exportFehler, setExportFehler] = useState<string | null>(null);
  const [exportLaeuft, setExportLaeuft] = useState(false);

  function setze<K extends keyof FaehigkeitenFilter>(schluessel: K, wert: FaehigkeitenFilter[K]) {
    setFilter((alt) => ({ ...alt, [schluessel]: wert }));
  }

  async function exportieren() {
    setExportFehler(null);
    setExportLaeuft(true);
    try {
      const { blob, nomFichier } = await exportFaehigkeitenBericht(filter);
      declencherTelechargement(blob, nomFichier);
    } catch (fehler) {
      setExportFehler(extractApiErrorMessage(fehler, t("faehigkeiten.reporting.export_fehler")));
    } finally {
      setExportLaeuft(false);
    }
  }

  const daten = bericht.data;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-text-primary">
          {t("faehigkeiten.reporting.titel")}
        </h2>
        <p className="mt-1 text-sm text-text-secondary">{t("faehigkeiten.reporting.untertitel")}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <label>
          <span className={LABEL}>{t("faehigkeiten.reporting.suche")}</span>
          <input
            value={filter.q}
            onChange={(e) => setze("q", e.target.value)}
            placeholder={t("faehigkeiten.reporting.suche_platzhalter")}
            className={FELD}
          />
        </label>
        <label>
          <span className={LABEL}>{t("faehigkeiten.reporting.kategorie")}</span>
          <select
            value={filter.kategorie}
            onChange={(e) => setze("kategorie", e.target.value)}
            className={FELD}
          >
            <option value="">{t("faehigkeiten.reporting.alle")}</option>
            {FAEHIGKEIT_KATEGORIEN.map((k) => (
              <option key={k} value={k}>
                {t(`faehigkeiten.kategorie.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={LABEL}>{t("faehigkeiten.reporting.faehigkeit")}</span>
          <select
            value={filter.faehigkeit}
            onChange={(e) => setze("faehigkeit", e.target.value)}
            className={FELD}
          >
            <option value="">{t("faehigkeiten.reporting.alle")}</option>
            {(katalog.data ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {faehigkeitLabel(f.bezeichnung)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={LABEL}>{t("faehigkeiten.reporting.status")}</span>
          <select
            value={filter.statut}
            onChange={(e) => setze("statut", e.target.value)}
            className={FELD}
          >
            <option value="">{t("faehigkeiten.reporting.alle")}</option>
            {STATUTS_MEMBRE.map((s) => (
              <option key={s.value} value={s.value}>
                {t(s.labelKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 pb-2 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={filter.alle}
            onChange={(e) => setze("alle", e.target.checked)}
          />
          {t("faehigkeiten.reporting.auch_leere")}
        </label>
        <button
          type="button"
          onClick={() => setFilter(START)}
          className="pb-2 text-xs text-ca hover:underline"
        >
          {t("faehigkeiten.reporting.zuruecksetzen")}
        </button>
        <button
          type="button"
          onClick={exportieren}
          disabled={exportLaeuft}
          className="ml-auto rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-50"
        >
          {t("faehigkeiten.reporting.export")}
        </button>
      </div>
      {exportFehler && <p className="text-sm text-status-dangerText">{exportFehler}</p>}

      {bericht.isLoading && <p className="text-sm text-text-tertiary">{t("faehigkeiten.laden")}</p>}
      {bericht.isError && (
        <p className="text-sm text-status-dangerText">{t("faehigkeiten.fehler")}</p>
      )}

      {daten && (
        <>
          <p className="text-sm text-text-secondary" data-testid="faehigkeiten-summen">
            {t("faehigkeiten.reporting.summen", {
              mitglieder: daten.summen.mitglieder,
              faehigkeiten: daten.summen.faehigkeiten,
            })}
          </p>
          {daten.ergebnisse.length === 0 && (
            <p className="text-sm text-text-tertiary">{t("faehigkeiten.reporting.leer")}</p>
          )}
          {FAEHIGKEIT_KATEGORIEN.map((kategorie) => {
            const zeilen = daten.ergebnisse.filter((z) => z.kategorie === kategorie);
            if (zeilen.length === 0) return null;
            return (
              <section key={kategorie} className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
                <h3 className="mb-2 text-xs font-bold uppercase text-text-tertiary">
                  {t(`faehigkeiten.kategorie.${kategorie}`)}
                </h3>
                <div className="space-y-1">
                  {zeilen.map((zeile) => (
                    <details key={zeile.id} className="rounded-cid border border-text-tertiary/15">
                      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span className="font-medium text-text-primary">
                          {faehigkeitLabel(zeile.bezeichnung)}
                        </span>
                        <span className="rounded-full bg-ca/10 px-2 py-0.5 text-xs font-bold text-ca">
                          {t("faehigkeiten.reporting.anzahl", { count: zeile.anzahl })}
                        </span>
                      </summary>
                      <div className="overflow-x-auto px-3 pb-3">
                        {zeile.mitglieder.length === 0 ? (
                          <p className="text-xs text-text-tertiary">
                            {t("faehigkeiten.reporting.niemand")}
                          </p>
                        ) : (
                          <table className="w-full text-left text-xs">
                            <thead className="text-text-tertiary">
                              <tr>
                                <th className="py-1 pr-3">{t("faehigkeiten.reporting.name")}</th>
                                <th className="py-1 pr-3">{t("faehigkeiten.reporting.status")}</th>
                                <th className="py-1 pr-3">{t("faehigkeiten.reporting.kontakt")}</th>
                                <th className="py-1 pr-3">{t("faehigkeiten.reporting.stadt")}</th>
                                <th className="py-1">{t("faehigkeiten.reporting.anmerkung")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {zeile.mitglieder.map((m) => (
                                <tr key={m.id} className="border-t border-text-tertiary/10">
                                  <td className="py-1 pr-3">
                                    <Link
                                      to={`/membres/${m.id}`}
                                      className="text-ca hover:underline"
                                    >
                                      {m.nom_complet}
                                    </Link>
                                  </td>
                                  <td className="py-1 pr-3">
                                    <StatutBadge statut={m.statut} />
                                  </td>
                                  <td className="py-1 pr-3">{m.email}</td>
                                  <td className="py-1 pr-3">{m.ville}</td>
                                  <td className="py-1">{m.kommentar}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        {!zeile.ist_standard && (
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                window.confirm(
                                  t("faehigkeiten.reporting.loeschen_bestaetigen", {
                                    name: faehigkeitLabel(zeile.bezeichnung),
                                  }),
                                )
                              ) {
                                loeschen.mutate(zeile.id);
                              }
                            }}
                            className="mt-2 text-xs text-status-dangerText hover:underline"
                          >
                            {t("faehigkeiten.reporting.loeschen")}
                          </button>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
