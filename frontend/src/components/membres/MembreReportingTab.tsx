/**
 * Tab "Reporting" im Modul Mitglieder (Nutzerwunsch 2026-10-07), ab Rolle RH :
 *   1. Mitgliederliste mit Statushistorie je Jahr und Aktivitätszahlen,
 *   2. alle Aktivitäten (Mitgliedschaften, Bestellungen, Teilnahmen, Beiträge, Projektbeiträge,
 *      Projektmitarbeit, Statuswechsel) in einer Liste, neueste zuerst,
 *   3. gemeinsame Filter für beide Ansichten und Excel-Export der gefilterten Auswahl.
 * Aus der Mitgliederliste führt "Aktivitäten" direkt zur Aktivitätenliste dieses Mitglieds.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { exportMembreReporting } from "../../api/membreReporting";
import { useAktivitaetenReporting, useMitgliederReporting } from "../../hooks/useMembreReporting";
import { BUNDESLANDER, PAYS_MEMBRE, STATUTS_MEMBRE } from "../../types/membre";
import {
  AKTIVITAET_TYPEN,
  MITGLIED_AKTIVITAET_TYPEN,
  type AktivitaetTyp,
  type MembreReportingFiltre,
  type MitgliederSortierung,
  type ReportingAnsicht,
} from "../../types/membreReporting";
import { extractApiErrorMessage } from "../../utils/apiError";
import { formatBetrag } from "../../utils/partner";
import { declencherTelechargement } from "../../utils/telechargement";
import StatutBadge from "../ui/StatutBadge";
import MembreSearchPicker from "./MembreSearchPicker";

const FELD = "rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm";
const LABEL = "mb-1 block text-[10px] uppercase text-text-tertiary";
const SORTIERUNGEN: MitgliederSortierung[] = [
  "nom",
  "aktivitaeten",
  "betrag",
  "date_adhesion",
  "numero_membre",
];
const STATUS_WERTE = [
  "payee",
  "en_attente",
  "en_attente_paiement",
  "en_attente_justificatif",
  "confirmee",
  "en_preparation",
  "expediee",
  "livree",
  "annulee",
  "remboursee",
  "echouee",
  "rabais_refuse",
  "brouillon",
];

const START: MembreReportingFiltre = {
  q: "",
  statut: "",
  pays: "",
  land: "",
  ville: "",
  date_adhesion_apres: "",
  date_adhesion_avant: "",
  historie_statut: "",
  historie_jahr: "",
  typ: [],
  von: "",
  bis: "",
  aktivitaet_status: "",
  min_betrag: "",
  max_betrag: "",
  min_aktivitaeten: "",
  ohne_aktivitaet: false,
  sortierung: "nom",
  membre: "",
};

function Kennzahl({ label, wert }: { label: string; wert: string }) {
  return (
    <div className="rounded-cid-lg bg-bg-primary px-4 py-3 shadow-sm">
      <div className="text-[11px] uppercase tracking-wide text-text-tertiary">{label}</div>
      <div className="mt-1 text-lg font-bold tabular-nums text-text-primary">{wert}</div>
    </div>
  );
}

function datumKurz(iso: string, sprache: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(sprache === "fr" ? "fr-FR" : "de-DE");
}

export default function MembreReportingTab() {
  const { t, i18n } = useTranslation("membres");
  const [ansicht, setAnsicht] = useState<ReportingAnsicht>("mitglieder");
  const [filtre, setFiltre] = useState<MembreReportingFiltre>(START);
  const [seite, setSeite] = useState(1);
  const [auswahl, setAuswahl] = useState<{
    id: string;
    prenom: string;
    nom: string;
    numero_membre?: string;
  } | null>(null);
  const [exportLaeuft, setExportLaeuft] = useState(false);
  const [exportFehler, setExportFehler] = useState<string | null>(null);

  const mitglieder = useMitgliederReporting(filtre, seite, ansicht === "mitglieder");
  const aktivitaeten = useAktivitaetenReporting(filtre, seite, ansicht === "aktivitaeten");
  const aktuell = ansicht === "mitglieder" ? mitglieder : aktivitaeten;
  const gesamt = aktuell.data?.count ?? 0;
  const groesse = aktuell.data?.page_size ?? 25;
  const seitenAnzahl = Math.max(Math.ceil(gesamt / groesse), 1);
  const euro = (wert: string) => formatBetrag(wert, i18n.language);

  function setze<K extends keyof MembreReportingFiltre>(k: K, v: MembreReportingFiltre[K]) {
    setFiltre((alt) => ({ ...alt, [k]: v }));
    setSeite(1);
  }

  function typUmschalten(typ: AktivitaetTyp) {
    setze(
      "typ",
      filtre.typ.includes(typ) ? filtre.typ.filter((x) => x !== typ) : [...filtre.typ, typ],
    );
  }

  function ansichtWechseln(neu: ReportingAnsicht) {
    setAnsicht(neu);
    setSeite(1);
  }

  async function exportieren() {
    setExportFehler(null);
    setExportLaeuft(true);
    try {
      const { blob, nomFichier } = await exportMembreReporting(ansicht, filtre);
      declencherTelechargement(blob, nomFichier);
    } catch (error) {
      setExportFehler(extractApiErrorMessage(error, t("reporting.export_fehler")));
    } finally {
      setExportLaeuft(false);
    }
  }

  const typen = ansicht === "mitglieder" ? MITGLIED_AKTIVITAET_TYPEN : AKTIVITAET_TYPEN;

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
      <p className="mb-3 text-sm text-text-tertiary">{t("reporting.untertitel")}</p>
      {exportFehler && <p className="mb-3 text-sm text-status-dangerText">{exportFehler}</p>}

      <div
        className="mb-4 inline-flex rounded-cid border border-text-tertiary/30 p-0.5"
        role="group"
        aria-label={t("reporting.ansicht")}
      >
        {(["mitglieder", "aktivitaeten"] as const).map((a) => (
          <button
            key={a}
            type="button"
            aria-pressed={ansicht === a}
            onClick={() => ansichtWechseln(a)}
            className={`rounded-cid px-3 py-1 text-sm ${
              ansicht === a ? "bg-ca text-white" : "text-text-secondary hover:bg-bg-tertiary"
            }`}
          >
            {t(`reporting.ansicht_${a}`)}
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="w-60">
          <span className={LABEL}>{t("reporting.filter_mitglied")}</span>
          <MembreSearchPicker
            selection={auswahl}
            placeholder={t("reporting.filter_mitglied_placeholder")}
            onSelect={(m) => {
              setAuswahl(m ?? null);
              setze("membre", m?.id ?? "");
            }}
          />
        </div>
        <div>
          <label htmlFor="mrep-q" className={LABEL}>
            {t("liste.recherche")}
          </label>
          <input
            id="mrep-q"
            type="search"
            value={filtre.q}
            onChange={(e) => setze("q", e.target.value)}
            className={`${FELD} w-44`}
          />
        </div>
        <div>
          <label htmlFor="mrep-statut" className={LABEL}>
            {t("liste.filtre_statut")}
          </label>
          <select
            id="mrep-statut"
            value={filtre.statut}
            onChange={(e) => setze("statut", e.target.value as MembreReportingFiltre["statut"])}
            className={FELD}
          >
            <option value="">{t("liste.tous_statuts")}</option>
            {STATUTS_MEMBRE.map((s) => (
              <option key={s.value} value={s.value}>
                {t(s.labelKey)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="mrep-pays" className={LABEL}>
            {t("liste.filtre_pays")}
          </label>
          <select
            id="mrep-pays"
            value={filtre.pays}
            onChange={(e) => setze("pays", e.target.value)}
            className={FELD}
          >
            <option value="">{t("liste.tous_pays")}</option>
            {PAYS_MEMBRE.map((p) => (
              <option key={p.value} value={p.value}>
                {t(p.labelKey)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="mrep-land" className={LABEL}>
            {t("liste.filtre_land")}
          </label>
          <select
            id="mrep-land"
            value={filtre.land}
            onChange={(e) => setze("land", e.target.value)}
            className={FELD}
          >
            <option value="">{t("liste.tous_lander")}</option>
            {BUNDESLANDER.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="mrep-ville" className={LABEL}>
            {t("liste.filtre_ville")}
          </label>
          <input
            id="mrep-ville"
            value={filtre.ville}
            onChange={(e) => setze("ville", e.target.value)}
            className={`${FELD} w-32`}
          />
        </div>
        <div>
          <label htmlFor="mrep-adh-von" className={LABEL}>
            {t("liste.filtre_adhesion_apres")}
          </label>
          <input
            id="mrep-adh-von"
            type="date"
            value={filtre.date_adhesion_apres}
            onChange={(e) => setze("date_adhesion_apres", e.target.value)}
            className={FELD}
          />
        </div>
        <div>
          <label htmlFor="mrep-adh-bis" className={LABEL}>
            {t("liste.filtre_adhesion_avant")}
          </label>
          <input
            id="mrep-adh-bis"
            type="date"
            value={filtre.date_adhesion_avant}
            onChange={(e) => setze("date_adhesion_avant", e.target.value)}
            className={FELD}
          />
        </div>
        <div>
          <label htmlFor="mrep-hist-statut" className={LABEL}>
            {t("reporting.filter_historie_statut")}
          </label>
          <select
            id="mrep-hist-statut"
            value={filtre.historie_statut}
            onChange={(e) =>
              setze("historie_statut", e.target.value as MembreReportingFiltre["historie_statut"])
            }
            className={FELD}
          >
            <option value="">{t("reporting.alle")}</option>
            {STATUTS_MEMBRE.map((s) => (
              <option key={s.value} value={s.value}>
                {t(s.labelKey)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="mrep-hist-jahr" className={LABEL}>
            {t("reporting.filter_historie_jahr")}
          </label>
          <input
            id="mrep-hist-jahr"
            inputMode="numeric"
            maxLength={4}
            value={filtre.historie_jahr}
            onChange={(e) => setze("historie_jahr", e.target.value.replace(/\D/g, ""))}
            className={`${FELD} w-20`}
          />
        </div>
        <div>
          <label htmlFor="mrep-von" className={LABEL}>
            {t("reporting.filter_von")}
          </label>
          <input
            id="mrep-von"
            type="date"
            value={filtre.von}
            onChange={(e) => setze("von", e.target.value)}
            className={FELD}
          />
        </div>
        <div>
          <label htmlFor="mrep-bis" className={LABEL}>
            {t("reporting.filter_bis")}
          </label>
          <input
            id="mrep-bis"
            type="date"
            value={filtre.bis}
            onChange={(e) => setze("bis", e.target.value)}
            className={FELD}
          />
        </div>
        <div>
          <label htmlFor="mrep-akt-status" className={LABEL}>
            {t("reporting.filter_aktivitaet_status")}
          </label>
          <select
            id="mrep-akt-status"
            value={filtre.aktivitaet_status}
            onChange={(e) => setze("aktivitaet_status", e.target.value)}
            className={FELD}
          >
            <option value="">{t("reporting.alle")}</option>
            {STATUS_WERTE.map((s) => (
              <option key={s} value={s}>
                {t(`reporting.status.${s}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="mrep-min" className={LABEL}>
            {t("reporting.filter_min_betrag")}
          </label>
          <input
            id="mrep-min"
            inputMode="decimal"
            value={filtre.min_betrag}
            onChange={(e) => setze("min_betrag", e.target.value)}
            className={`${FELD} w-24`}
          />
        </div>
        <div>
          <label htmlFor="mrep-max" className={LABEL}>
            {t("reporting.filter_max_betrag")}
          </label>
          <input
            id="mrep-max"
            inputMode="decimal"
            value={filtre.max_betrag}
            onChange={(e) => setze("max_betrag", e.target.value)}
            className={`${FELD} w-24`}
          />
        </div>
        {ansicht === "mitglieder" && (
          <>
            <div>
              <label htmlFor="mrep-min-akt" className={LABEL}>
                {t("reporting.filter_min_aktivitaeten")}
              </label>
              <input
                id="mrep-min-akt"
                inputMode="numeric"
                value={filtre.min_aktivitaeten}
                onChange={(e) => setze("min_aktivitaeten", e.target.value.replace(/\D/g, ""))}
                className={`${FELD} w-20`}
              />
            </div>
            <div>
              <label htmlFor="mrep-sort" className={LABEL}>
                {t("liste.trier_par")}
              </label>
              <select
                id="mrep-sort"
                value={filtre.sortierung}
                onChange={(e) => setze("sortierung", e.target.value as MitgliederSortierung)}
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
                checked={filtre.ohne_aktivitaet}
                onChange={(e) => setze("ohne_aktivitaet", e.target.checked)}
              />
              {t("reporting.ohne_aktivitaet")}
            </label>
          </>
        )}
        <button
          type="button"
          onClick={() => {
            setFiltre(START);
            setAuswahl(null);
            setSeite(1);
          }}
          className="pb-1.5 text-sm text-text-secondary underline"
        >
          {t("liste.reinitialiser")}
        </button>
      </div>

      <div
        className="mb-3 flex flex-wrap items-center gap-1.5"
        role="group"
        aria-label={t("reporting.filter_typ")}
      >
        <span className="mr-1 text-[10px] uppercase text-text-tertiary">
          {t("reporting.filter_typ")}
        </span>
        {typen.map((typ) => {
          const aktiv = filtre.typ.includes(typ);
          return (
            <button
              key={typ}
              type="button"
              aria-pressed={aktiv}
              onClick={() => typUmschalten(typ)}
              className={`rounded-full border px-2.5 py-1 text-xs ${
                aktiv
                  ? "border-brand-red bg-brand-red/10 font-medium"
                  : "border-text-tertiary/30 text-text-secondary hover:bg-bg-tertiary"
              }`}
            >
              {t(`reporting.typ.${typ}`)}
            </button>
          );
        })}
      </div>

      {ansicht === "mitglieder" && mitglieder.data && (
        <div className="mb-4 grid grid-cols-3 gap-3">
          <Kennzahl
            label={t("reporting.kpi_mitglieder")}
            wert={String(mitglieder.data.summen.mitglieder)}
          />
          <Kennzahl
            label={t("reporting.kpi_aktivitaeten")}
            wert={String(mitglieder.data.summen.aktivitaeten)}
          />
          <Kennzahl label={t("reporting.kpi_betrag")} wert={euro(mitglieder.data.summen.betrag)} />
        </div>
      )}
      {ansicht === "aktivitaeten" && aktivitaeten.data && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          {aktivitaeten.data.typen.map((typ) => {
            const s = aktivitaeten.data?.summen[typ];
            return (
              <div key={typ} className="rounded-cid-lg bg-bg-primary px-3 py-2 shadow-sm">
                <div className="text-[11px] uppercase text-text-tertiary">
                  {t(`reporting.typ.${typ}`)}
                </div>
                <div className="text-lg font-bold tabular-nums">{s?.anzahl ?? 0}</div>
                {s && Number(s.betrag) > 0 && (
                  <div className="text-xs tabular-nums text-text-secondary">{euro(s.betrag)}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="mb-2 text-[11px] text-text-tertiary">{t("reporting.betrag_hinweis")}</p>

      {aktuell.isLoading && <p className="text-sm text-text-tertiary">{t("liste.chargement")}</p>}
      {aktuell.isError && (
        <p className="text-sm text-status-dangerText">{t("reporting.fehler_laden")}</p>
      )}
      {aktuell.data && gesamt === 0 && (
        <p className="text-sm text-text-tertiary">{t("reporting.keine_treffer")}</p>
      )}

      {ansicht === "mitglieder" && mitglieder.data && mitglieder.data.ergebnisse.length > 0 && (
        <div className="overflow-x-auto rounded-cid-lg bg-bg-primary shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-text-tertiary/20 text-left text-xs font-semibold uppercase text-text-tertiary">
                <th className="px-3 py-2">{t("liste.col_membre")}</th>
                <th className="px-3 py-2">{t("liste.col_statut")}</th>
                <th className="px-3 py-2">{t("reporting.col_seit")}</th>
                <th className="px-3 py-2">{t("reporting.col_historie")}</th>
                <th className="px-3 py-2">{t("reporting.col_aktivitaeten")}</th>
                <th className="px-3 py-2 text-right">{t("reporting.col_betrag")}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {mitglieder.data.ergebnisse.map((m) => (
                <tr key={m.id} className="border-b border-text-tertiary/10 align-top">
                  <td className="px-3 py-2">
                    <Link to={`/membres/${m.id}`} className="font-medium text-ca hover:underline">
                      {m.prenom} {m.nom}
                    </Link>
                    <div className="text-xs text-text-tertiary">
                      {m.numero_membre} · {m.email}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <StatutBadge statut={m.statut} />
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {datumKurz(m.date_adhesion, i18n.language)}
                  </td>
                  <td className="px-3 py-2">
                    {m.historie.length === 0 ? (
                      <span className="text-text-tertiary">—</span>
                    ) : (
                      <ul className="flex flex-wrap gap-1">
                        {m.historie.map((h) => (
                          <li
                            key={`${h.annee}-${h.date_effet}`}
                            title={t(`reporting.raison.${h.raison}`)}
                            className="rounded-full bg-bg-tertiary px-2 py-0.5 text-[11px]"
                          >
                            {h.annee} · {t(`statut.${h.statut}`)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-text-secondary">
                    {m.aktivitaeten_gesamt === 0
                      ? "—"
                      : MITGLIED_AKTIVITAET_TYPEN.filter((typ) => (m.aktivitaeten[typ] ?? 0) > 0)
                          .map((typ) => `${t(`reporting.typ.${typ}`)} ${m.aktivitaeten[typ]}`)
                          .join(" · ")}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{euro(m.betrag_gesamt)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setFiltre((alt) => ({ ...alt, membre: m.id }));
                        setAuswahl({
                          id: m.id,
                          prenom: m.prenom,
                          nom: m.nom,
                          numero_membre: m.numero_membre,
                        });
                        setSeite(1);
                        setAnsicht("aktivitaeten");
                      }}
                      className="text-xs text-ca hover:underline"
                    >
                      {t("reporting.aktivitaeten_zeigen")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ansicht === "aktivitaeten" &&
        aktivitaeten.data &&
        aktivitaeten.data.ergebnisse.length > 0 && (
          <div className="overflow-x-auto rounded-cid-lg bg-bg-primary shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-text-tertiary/20 text-left text-xs font-semibold uppercase text-text-tertiary">
                  <th className="px-3 py-2">{t("reporting.col_datum")}</th>
                  <th className="px-3 py-2">{t("reporting.col_art")}</th>
                  <th className="px-3 py-2">{t("liste.col_membre")}</th>
                  <th className="px-3 py-2">{t("reporting.col_beschreibung")}</th>
                  <th className="px-3 py-2 text-right">{t("reporting.col_betrag")}</th>
                  <th className="px-3 py-2">{t("liste.col_statut")}</th>
                </tr>
              </thead>
              <tbody>
                {aktivitaeten.data.ergebnisse.map((a) => (
                  <tr
                    key={`${a.typ}-${a.id}`}
                    className="border-b border-text-tertiary/10 align-top"
                  >
                    <td className="px-3 py-2 tabular-nums">{datumKurz(a.datum, i18n.language)}</td>
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-bg-tertiary px-2 py-0.5 text-[11px]">
                        {t(`reporting.typ.${a.typ}`)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <Link to={`/membres/${a.membre_id}`} className="text-ca hover:underline">
                        {a.membre_name}
                      </Link>
                      <div className="text-xs text-text-tertiary">{a.numero_membre}</div>
                    </td>
                    <td className="px-3 py-2">{a.titel}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {a.betrag === null ? "—" : euro(a.betrag)}
                    </td>
                    <td className="px-3 py-2 text-xs text-text-secondary">
                      {a.statut
                        ? t(`reporting.status.${a.statut}`, { defaultValue: a.statut })
                        : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {gesamt > groesse && (
        <div className="mt-3 flex items-center justify-between text-sm text-text-secondary">
          <span>{t("reporting.seite_von", { seite, seiten: seitenAnzahl, anzahl: gesamt })}</span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={seite <= 1}
              onClick={() => setSeite((s) => s - 1)}
              className="rounded-cid border border-text-tertiary/30 px-3 py-1 disabled:opacity-40"
            >
              {t("reporting.zurueck")}
            </button>
            <button
              type="button"
              disabled={seite >= seitenAnzahl}
              onClick={() => setSeite((s) => s + 1)}
              className="rounded-cid border border-text-tertiary/30 px-3 py-1 disabled:opacity-40"
            >
              {t("reporting.weiter")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
