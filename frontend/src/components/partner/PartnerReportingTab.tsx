/**
 * Tab "Reporting" der Partnerverwaltung (Nutzerwunsch 2026-10-07): alle Business Partner und
 * Lieferanten mit verknüpften Elementen (Projekte, Veranstaltungen, Shop-Artikel), Umsatz
 * (Einnahmen + genehmigte Ausgaben im gewählten Zeitraum) und Details, mit Filtern und
 * Excel-Export. Die Zeilen lassen sich aufklappen. Lesen ab Rolle RH.
 */
import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { exportReporting } from "../../api/partner";
import { usePartnerKategorien, usePartnerReporting } from "../../hooks/usePartner";
import type {
  PartnerReportingFiltre,
  PartnerReportingZeile,
  ReportingSortierung,
  VerknuepfungRolle,
  ZielTyp,
} from "../../types/partner";
import { extractApiErrorMessage } from "../../utils/apiError";
import { declencherTelechargement } from "../../utils/telechargement";
import { formatBetrag, kategorieName } from "../../utils/partner";
import { Sterne } from "./Sterne";

const FELD = "rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm";
const LABEL = "mb-1 block text-[10px] uppercase text-text-tertiary";
const ROLLEN: VerknuepfungRolle[] = [
  "lieferant",
  "sponsor",
  "kooperation",
  "location",
  "dienstleister",
  "sonstige",
];
const ZIEL_TYPEN: ZielTyp[] = ["projet", "evenement", "produit"];
const SORTIERUNGEN: ReportingSortierung[] = [
  "nom",
  "umsatz",
  "einnahmen",
  "ausgaben",
  "saldo",
  "verknuepfungen",
];

const START: PartnerReportingFiltre = {
  q: "",
  typ: "",
  statut: "",
  kategorie: [],
  rolle: "",
  ziel_typ: "",
  bevorzugt: false,
  auf_startseite: false,
  von: "",
  bis: "",
  min_umsatz: "",
  max_umsatz: "",
  sortierung: "nom",
};

function Kennzahl({
  label,
  wert,
  negativ = false,
}: {
  label: string;
  wert: string;
  negativ?: boolean;
}) {
  return (
    <div className="rounded-cid-lg bg-bg-primary px-4 py-3 shadow-sm">
      <div className="text-[11px] uppercase tracking-wide text-text-tertiary">{label}</div>
      <div
        className={`mt-1 text-lg font-bold tabular-nums ${negativ ? "text-status-dangerText" : "text-text-primary"}`}
      >
        {wert}
      </div>
    </div>
  );
}

function Details({ zeile, sprache }: { zeile: PartnerReportingZeile; sprache: string }) {
  const { t } = useTranslation("partner");
  return (
    <div className="grid gap-4 px-3 py-3 text-sm md:grid-cols-2">
      <dl className="space-y-1">
        <div className="flex gap-2">
          <dt className="w-32 text-text-tertiary">{t("hauptkontakt")}</dt>
          <dd>{zeile.hauptkontakt_name || "—"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-32 text-text-tertiary">{t("feld_email")}</dt>
          <dd>{zeile.email || "—"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-32 text-text-tertiary">{t("feld_telefon")}</dt>
          <dd>{zeile.telefon || "—"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-32 text-text-tertiary">{t("feld_website")}</dt>
          <dd>{zeile.website || "—"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-32 text-text-tertiary">{t("feld_ville")}</dt>
          <dd>{[zeile.ville, zeile.pays].filter(Boolean).join(", ") || "—"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-32 text-text-tertiary">{t("bewertung")}</dt>
          <dd>
            <Sterne wert={zeile.bewertung_schnitt} />
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-32 text-text-tertiary">{t("reporting.angebote")}</dt>
          <dd>
            {t("reporting.angebote_zeile", {
              anzahl: zeile.angebote_anzahl,
              zuschlaege: zeile.zuschlaege_anzahl,
              summe: formatBetrag(zeile.zuschlaege_summe, sprache),
            })}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-32 text-text-tertiary">{t("reporting.buchungen")}</dt>
          <dd>
            {t("reporting.buchungen_zeile", {
              einnahmen: zeile.einnahmen_anzahl,
              ausgaben: zeile.ausgaben_anzahl,
            })}
          </dd>
        </div>
        {zeile.auf_startseite && <div className="text-xs text-ca">{t("reporting.im_banner")}</div>}
      </dl>
      <div>
        {ZIEL_TYPEN.map((ziel) => {
          const eintraege = zeile.verknuepfungen.filter((v) => v.ziel_typ === ziel);
          if (eintraege.length === 0) return null;
          return (
            <div key={ziel} className="mb-2">
              <div className="text-[11px] font-semibold uppercase text-text-tertiary">
                {t(`reporting.ziel_${ziel}`)} ({eintraege.length})
              </div>
              <ul className="mt-1 space-y-0.5">
                {eintraege.map((v) => (
                  <li key={v.id}>
                    {v.ziel_label}{" "}
                    <span className="text-xs text-text-tertiary">· {t(`rolle_${v.rolle}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {zeile.verknuepfungen.length === 0 && (
          <p className="text-text-tertiary">{t("reporting.keine_verknuepfungen")}</p>
        )}
        <Link
          to={`/admin/partner/${zeile.id}`}
          className="mt-2 inline-block text-xs text-ca hover:underline"
        >
          {t("reporting.zum_partner")}
        </Link>
      </div>
    </div>
  );
}

export default function PartnerReportingTab() {
  const { t, i18n } = useTranslation("partner");
  const [filtre, setFiltre] = useState<PartnerReportingFiltre>(START);
  const [offen, setOffen] = useState<string | null>(null);
  const [exportLaeuft, setExportLaeuft] = useState(false);
  const [exportFehler, setExportFehler] = useState<string | null>(null);
  const reporting = usePartnerReporting(filtre);
  const kategorien = usePartnerKategorien();
  const alleKategorien = kategorien.data ?? [];
  const zeilen = reporting.data?.ergebnisse ?? [];
  const summen = reporting.data?.summen;

  function setze<K extends keyof PartnerReportingFiltre>(k: K, v: PartnerReportingFiltre[K]) {
    setFiltre((alt) => ({ ...alt, [k]: v }));
  }

  function kategorieUmschalten(id: string) {
    setze(
      "kategorie",
      filtre.kategorie.includes(id)
        ? filtre.kategorie.filter((x) => x !== id)
        : [...filtre.kategorie, id],
    );
  }

  async function exportieren() {
    setExportFehler(null);
    setExportLaeuft(true);
    try {
      const { blob, nomFichier } = await exportReporting(filtre);
      declencherTelechargement(blob, nomFichier);
    } catch (error) {
      setExportFehler(extractApiErrorMessage(error, t("reporting.export_fehler")));
    } finally {
      setExportLaeuft(false);
    }
  }

  const euro = (wert: string) => formatBetrag(wert, i18n.language);

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-text-primary">{t("reporting.titel")}</h1>
        <button
          type="button"
          onClick={exportieren}
          disabled={exportLaeuft}
          className="ml-auto rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary disabled:opacity-50"
        >
          {exportLaeuft ? t("reporting.export_laeuft") : t("reporting.export")}
        </button>
      </div>
      <p className="mb-4 text-sm text-text-tertiary">{t("reporting.untertitel")}</p>
      {exportFehler && <p className="mb-3 text-sm text-status-dangerText">{exportFehler}</p>}

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="rep-suche" className={LABEL}>
            {t("suche")}
          </label>
          <input
            id="rep-suche"
            type="search"
            value={filtre.q}
            onChange={(e) => setze("q", e.target.value)}
            className={`${FELD} w-48`}
          />
        </div>
        <div>
          <label htmlFor="rep-typ" className={LABEL}>
            {t("feld_typ")}
          </label>
          <select
            id="rep-typ"
            value={filtre.typ}
            onChange={(e) => setze("typ", e.target.value as PartnerReportingFiltre["typ"])}
            className={FELD}
          >
            <option value="">{t("alle")}</option>
            <option value="partner">{t("typ_partner")}</option>
            <option value="lieferant">{t("typ_lieferant")}</option>
          </select>
        </div>
        <div>
          <label htmlFor="rep-status" className={LABEL}>
            {t("status")}
          </label>
          <select
            id="rep-status"
            value={filtre.statut}
            onChange={(e) => setze("statut", e.target.value as PartnerReportingFiltre["statut"])}
            className={FELD}
          >
            <option value="">{t("status_offen")}</option>
            <option value="aktiv">{t("status_aktiv")}</option>
            <option value="inaktiv">{t("status_inaktiv")}</option>
            <option value="archiviert">{t("status_archiviert")}</option>
          </select>
        </div>
        <div>
          <label htmlFor="rep-rolle" className={LABEL}>
            {t("reporting.filter_rolle")}
          </label>
          <select
            id="rep-rolle"
            value={filtre.rolle}
            onChange={(e) => setze("rolle", e.target.value as PartnerReportingFiltre["rolle"])}
            className={FELD}
          >
            <option value="">{t("alle")}</option>
            {ROLLEN.map((r) => (
              <option key={r} value={r}>
                {t(`rolle_${r}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="rep-ziel" className={LABEL}>
            {t("reporting.filter_ziel")}
          </label>
          <select
            id="rep-ziel"
            value={filtre.ziel_typ}
            onChange={(e) =>
              setze("ziel_typ", e.target.value as PartnerReportingFiltre["ziel_typ"])
            }
            className={FELD}
          >
            <option value="">{t("alle")}</option>
            {ZIEL_TYPEN.map((z) => (
              <option key={z} value={z}>
                {t(`reporting.ziel_${z}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="rep-von" className={LABEL}>
            {t("reporting.filter_von")}
          </label>
          <input
            id="rep-von"
            type="date"
            value={filtre.von}
            onChange={(e) => setze("von", e.target.value)}
            className={FELD}
          />
        </div>
        <div>
          <label htmlFor="rep-bis" className={LABEL}>
            {t("reporting.filter_bis")}
          </label>
          <input
            id="rep-bis"
            type="date"
            value={filtre.bis}
            onChange={(e) => setze("bis", e.target.value)}
            className={FELD}
          />
        </div>
        <div>
          <label htmlFor="rep-min" className={LABEL}>
            {t("reporting.filter_min_umsatz")}
          </label>
          <input
            id="rep-min"
            inputMode="decimal"
            value={filtre.min_umsatz}
            onChange={(e) => setze("min_umsatz", e.target.value)}
            className={`${FELD} w-28`}
          />
        </div>
        <div>
          <label htmlFor="rep-max" className={LABEL}>
            {t("reporting.filter_max_umsatz")}
          </label>
          <input
            id="rep-max"
            inputMode="decimal"
            value={filtre.max_umsatz}
            onChange={(e) => setze("max_umsatz", e.target.value)}
            className={`${FELD} w-28`}
          />
        </div>
        <div>
          <label htmlFor="rep-sort" className={LABEL}>
            {t("sortierung")}
          </label>
          <select
            id="rep-sort"
            value={filtre.sortierung}
            onChange={(e) => setze("sortierung", e.target.value as ReportingSortierung)}
            className={FELD}
          >
            {SORTIERUNGEN.map((s) => (
              <option key={s} value={s}>
                {t(`reporting.sort_${s}`)}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-1.5 text-sm">
          <input
            type="checkbox"
            checked={filtre.bevorzugt}
            onChange={(e) => setze("bevorzugt", e.target.checked)}
          />
          {t("nur_bevorzugte")}
        </label>
        <label className="flex items-center gap-2 pb-1.5 text-sm">
          <input
            type="checkbox"
            checked={filtre.auf_startseite}
            onChange={(e) => setze("auf_startseite", e.target.checked)}
          />
          {t("reporting.nur_banner")}
        </label>
        <button
          type="button"
          onClick={() => setFiltre(START)}
          className="pb-1.5 text-sm text-text-secondary underline"
        >
          {t("reporting.zuruecksetzen")}
        </button>
      </div>

      {alleKategorien.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label={t("feld_kategorien")}>
          {alleKategorien
            .filter((k) => k.actif || filtre.kategorie.includes(k.id))
            .map((k) => {
              const aktiv = filtre.kategorie.includes(k.id);
              return (
                <button
                  key={k.id}
                  type="button"
                  aria-pressed={aktiv}
                  onClick={() => kategorieUmschalten(k.id)}
                  className={`rounded-full border px-2.5 py-1 text-xs ${
                    aktiv
                      ? "border-brand-red bg-brand-red/10 font-medium"
                      : "border-text-tertiary/30 text-text-secondary hover:bg-bg-tertiary"
                  }`}
                >
                  {kategorieName(k, i18n.language)}
                </button>
              );
            })}
        </div>
      )}

      {summen && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Kennzahl label={t("reporting.kpi_partner")} wert={String(summen.partner)} />
          <Kennzahl label={t("reporting.kpi_einnahmen")} wert={euro(summen.einnahmen)} />
          <Kennzahl label={t("reporting.kpi_ausgaben")} wert={euro(summen.ausgaben)} />
          <Kennzahl label={t("reporting.kpi_umsatz")} wert={euro(summen.umsatz)} />
          <Kennzahl
            label={t("reporting.kpi_saldo")}
            wert={euro(summen.saldo)}
            negativ={Number(summen.saldo) < 0}
          />
          <Kennzahl
            label={t("reporting.kpi_verknuepfungen")}
            wert={String(summen.verknuepfungen)}
          />
        </div>
      )}
      <p className="mb-2 text-[11px] text-text-tertiary">{t("reporting.umsatz_hinweis")}</p>

      {reporting.isLoading && <p className="text-sm text-text-tertiary">{t("laedt")}</p>}
      {reporting.isError && <p className="text-sm text-status-dangerText">{t("fehler_laden")}</p>}
      {reporting.data && zeilen.length === 0 && (
        <p className="text-sm text-text-tertiary">{t("keine_treffer")}</p>
      )}
      {zeilen.length > 0 && (
        <div className="overflow-x-auto rounded-cid border border-text-tertiary/20">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg-tertiary text-left text-xs uppercase text-text-tertiary">
                <th className="px-3 py-2">{t("feld_nom")}</th>
                <th className="px-3 py-2">{t("feld_typ")}</th>
                <th className="px-3 py-2">{t("feld_kategorien")}</th>
                <th className="px-3 py-2 text-right">{t("reporting.col_einnahmen")}</th>
                <th className="px-3 py-2 text-right">{t("reporting.col_ausgaben")}</th>
                <th className="px-3 py-2 text-right">{t("reporting.col_umsatz")}</th>
                <th className="px-3 py-2 text-right">{t("reporting.col_saldo")}</th>
                <th className="px-3 py-2 text-right">{t("verknuepfungen")}</th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map((z) => {
                const aufgeklappt = offen === z.id;
                return (
                  <Fragment key={z.id}>
                    <tr className="border-t border-text-tertiary/10 align-top">
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          aria-expanded={aufgeklappt}
                          aria-label={t(
                            aufgeklappt
                              ? "reporting.details_schliessen"
                              : "reporting.details_oeffnen",
                            { name: z.nom },
                          )}
                          onClick={() => setOffen(aufgeklappt ? null : z.id)}
                          className="mr-2 text-text-tertiary"
                        >
                          {aufgeklappt ? "▾" : "▸"}
                        </button>
                        <span className="font-medium">
                          {z.bevorzugt && "★ "}
                          {z.nom}
                        </span>
                        {z.statut !== "aktiv" && (
                          <span className="ml-2 rounded-full bg-bg-tertiary px-2 py-0.5 text-[11px] text-text-tertiary">
                            {t(`status_${z.statut}`)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">{t(`typ_${z.typ}`)}</td>
                      <td className="px-3 py-2 text-xs text-text-secondary">
                        {z.kategorien_namen.join(", ")}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {euro(z.einnahmen_summe)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {euro(z.ausgaben_summe)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {euro(z.umsatz)}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${
                          Number(z.saldo) < 0 ? "text-status-dangerText" : ""
                        }`}
                      >
                        {euro(z.saldo)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {z.verknuepfungen.length}
                      </td>
                    </tr>
                    {aufgeklappt && (
                      <tr className="bg-bg-secondary/40">
                        <td colSpan={8}>
                          <Details zeile={z} sprache={i18n.language} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
