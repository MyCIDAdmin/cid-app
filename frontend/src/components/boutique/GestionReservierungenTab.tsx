/**
 * Tab „Reservierungen“ der Shop-Verwaltung: Reservierungen (Modus „nur reservieren“) je Artikel
 * gruppiert. Jede Gruppe zeigt Frist, Fortschritt gegen die Obergrenze und – nach Fristende –
 * wie viele Stück noch nicht abgeholt sind. Mehrere Reservierungen lassen sich ankreuzen und
 * gemeinsam „als abgeholt markieren“ oder „freigeben“ (Freigeben gibt die Menge wieder frei,
 * es wird nichts gelöscht). Jede Aktion fragt vorher in Alltagssprache nach (AktionsBlatt).
 *
 * `startProdukt` kommt aus dem Überblick (Klick auf eine Aufgabe) und setzt den Artikelfilter.
 * Der Fortschritt stammt aus den Artikeldaten des Servers (`reservierung_max_gesamt` und
 * `reservierung_verfuegbar`), nicht aus der gefilterten Liste — der Statusfilter verfälscht ihn so nicht.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useProduits, useReservierungAktion, useReservierungen } from "../../hooks/useBoutique";
import type { Produit, Reservierung, StatutReservierung } from "../../types/boutique";
import { extractApiErrorMessage } from "../../utils/apiError";
import { lokaleSprache } from "../../utils/datum";
import { EinfachSchalter, HilfeHinweis } from "../ui/Erklaerung";
import AktionsBlatt from "./AktionsBlatt";

const STATUS: StatutReservierung[] = ["aktiv", "abgeholt", "storniert"];
const STATUS_STIL: Record<StatutReservierung, string> = {
  aktiv: "bg-status-warningBg text-status-warningText",
  abgeholt: "bg-status-successBg text-status-successText",
  storniert: "bg-bg-tertiary text-text-secondary",
};

type Aktion = "abholen" | "stornieren";
interface Blatt {
  aktion: Aktion;
  ids: string[];
}

function Fortschritt({ produit }: { produit: Produit }) {
  const { t } = useTranslation("boutique");
  const max = produit.reservierung_max_gesamt;
  const frei = produit.reservierung_verfuegbar;
  if (max == null || frei == null) return null;
  const vergeben = Math.max(0, max - frei);
  const prozent = max > 0 ? Math.min(100, Math.round((vergeben / max) * 100)) : 0;
  return (
    <div className="mt-2">
      <div
        role="progressbar"
        aria-label={t("reservierungen_tab.fortschritt_label")}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={vergeben}
        className="h-2 w-full overflow-hidden rounded-full bg-bg-tertiary"
      >
        <div className="h-full bg-ca" style={{ width: `${prozent}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-text-secondary">
        {t("reservierungen_tab.fortschritt", { vergeben, max })}
      </p>
    </div>
  );
}

export default function GestionReservierungenTab({
  modifiable = true,
  startProdukt = "",
}: { modifiable?: boolean; startProdukt?: string } = {}) {
  const { t } = useTranslation(["boutique", "common"]);
  const [produit, setProduit] = useState(startProdukt);
  const [statut, setStatut] = useState<StatutReservierung | "">("aktiv");
  const liste = useReservierungen({ produit, statut });
  const produkte = useProduits({});
  const aktion = useReservierungAktion();
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());
  const [blatt, setBlatt] = useState<Blatt | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const alleProdukte = produkte.data?.results ?? [];
  const reservierbar = alleProdukte.filter((p) => p.reservierung_modus === "nur_reservieren");
  const eintraege = liste.data?.results ?? [];
  const summe = eintraege.reduce((s, r) => s + r.quantite, 0);
  const datum = (iso: string) => new Date(iso).toLocaleDateString(lokaleSprache());

  // Gruppen je Artikel, nach Artikelname sortiert.
  const gruppen = new Map<string, Reservierung[]>();
  for (const r of eintraege) gruppen.set(r.produit, [...(gruppen.get(r.produit) ?? []), r]);
  const geordnet = [...gruppen.entries()].sort((a, b) =>
    a[1][0].produit_nom.localeCompare(b[1][0].produit_nom),
  );

  const aktive = (rs: Reservierung[]) => rs.filter((r) => r.statut === "aktiv");
  const umschalten = (id: string) =>
    setAuswahl((alt) => {
      const neu = new Set(alt);
      if (neu.has(id)) neu.delete(id);
      else neu.add(id);
      return neu;
    });
  const gruppeUmschalten = (rs: Reservierung[]) =>
    setAuswahl((alt) => {
      const ids = aktive(rs).map((r) => r.id);
      const alleDrin = ids.every((id) => alt.has(id));
      const neu = new Set(alt);
      for (const id of ids) {
        if (alleDrin) neu.delete(id);
        else neu.add(id);
      }
      return neu;
    });
  const ausgewaehlt = eintraege.filter((r) => r.statut === "aktiv" && auswahl.has(r.id));

  async function ausfuehren() {
    if (!blatt || !modifiable) return;
    setLaeuft(true);
    setFehler(null);
    const offen: string[] = [];
    let letzterFehler: unknown = null;
    for (const id of blatt.ids) {
      try {
        await aktion.mutateAsync({ id, aktion: blatt.aktion });
      } catch (e) {
        offen.push(id);
        letzterFehler = e;
      }
    }
    setLaeuft(false);
    if (offen.length === 0) {
      setBlatt(null);
      setAuswahl(new Set());
    } else {
      setBlatt({ ...blatt, ids: offen });
      setFehler(extractApiErrorMessage(letzterFehler, t("boutique:reservierungen_tab.fehler")));
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <select
          aria-label={t("boutique:reservierungen_tab.col_produkt")}
          value={produit}
          onChange={(e) => setProduit(e.target.value)}
          className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs"
        >
          <option value="">{t("boutique:reservierungen_tab.alle_produkte")}</option>
          {reservierbar.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nom}
            </option>
          ))}
        </select>
        <select
          aria-label={t("boutique:reservierungen_tab.col_status")}
          value={statut}
          onChange={(e) => setStatut(e.target.value as StatutReservierung | "")}
          className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs"
        >
          <option value="">{t("boutique:reservierungen_tab.alle_status")}</option>
          {STATUS.map((s) => (
            <option key={s} value={s}>
              {t(`boutique:reservierungen_tab.status.${s}`)}
            </option>
          ))}
        </select>
        <span className="text-xs text-text-secondary">
          {t("boutique:reservierungen_tab.summe", { anzahl: summe })}
        </span>
        <span className="ml-auto">
          <EinfachSchalter ns="boutique" />
        </span>
      </div>
      <HilfeHinweis ns="boutique">{t("boutique:reservierungen_tab.hilfe")}</HilfeHinweis>

      {ausgewaehlt.length > 0 && (
        <div
          role="region"
          aria-label={t("boutique:reservierungen_tab.ausgewaehlt", { count: ausgewaehlt.length })}
          className="sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-cid-lg bg-bg-primary p-3 shadow-md"
        >
          <span className="text-sm font-semibold text-text-primary">
            {t("boutique:reservierungen_tab.ausgewaehlt", { count: ausgewaehlt.length })}
          </span>
          <button
            type="button"
            disabled={!modifiable}
            onClick={() => setBlatt({ aktion: "abholen", ids: ausgewaehlt.map((r) => r.id) })}
            className="rounded-cid bg-ca px-3 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-40"
          >
            {t("boutique:reservierungen_tab.bulk_abholen")}
          </button>
          <button
            type="button"
            disabled={!modifiable}
            onClick={() => setBlatt({ aktion: "stornieren", ids: ausgewaehlt.map((r) => r.id) })}
            className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-secondary disabled:opacity-40"
          >
            {t("boutique:reservierungen_tab.bulk_freigeben")}
          </button>
          <button
            type="button"
            onClick={() => setAuswahl(new Set())}
            className="ml-auto text-xs text-text-tertiary underline"
          >
            {t("boutique:reservierungen_tab.auswahl_aufheben")}
          </button>
        </div>
      )}

      {liste.isError && (
        <p className="rounded-cid-lg bg-bg-primary px-4 py-6 text-center text-status-dangerText">
          {t("boutique:reservierungen_tab.fehler")}
        </p>
      )}
      {liste.data && eintraege.length === 0 && (
        <p className="rounded-cid-lg bg-bg-primary px-4 py-6 text-center text-text-tertiary">
          {t("boutique:reservierungen_tab.leer")}
        </p>
      )}

      <div className="space-y-3">
        {geordnet.map(([produktId, rs]) => {
          const artikel = alleProdukte.find((p) => p.id === produktId);
          const frist = artikel?.reservierung_frist ? new Date(artikel.reservierung_frist) : null;
          const fristVorbei = frist !== null && frist.getTime() < Date.now();
          const offeneMenge = aktive(rs).reduce((s, r) => s + r.quantite, 0);
          const alleAngekreuzt =
            aktive(rs).length > 0 && aktive(rs).every((r) => auswahl.has(r.id));
          return (
            <section
              key={produktId}
              aria-label={rs[0].produit_nom}
              className="rounded-cid-lg bg-bg-primary p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-text-primary">{rs[0].produit_nom}</h2>
                {frist && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      fristVorbei
                        ? "bg-status-dangerBg text-status-dangerText"
                        : "bg-bg-tertiary text-text-secondary"
                    }`}
                  >
                    {fristVorbei
                      ? t("boutique:reservierungen_tab.frist_vorbei")
                      : t("boutique:reservierungen_tab.frist_bis", {
                          datum: datum(frist.toISOString()),
                        })}
                  </span>
                )}
              </div>
              {artikel && <Fortschritt produit={artikel} />}
              {fristVorbei && offeneMenge > 0 && (
                <p
                  role="note"
                  className="mt-2 rounded-cid bg-status-dangerBg px-3 py-2 text-xs text-status-dangerText"
                >
                  {t("boutique:reservierungen_tab.offen_nach_frist", { count: offeneMenge })}
                </p>
              )}
              {aktive(rs).length > 1 && (
                <label className="mt-3 flex items-center gap-2 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={alleAngekreuzt}
                    disabled={!modifiable}
                    onChange={() => gruppeUmschalten(rs)}
                  />
                  {t("boutique:reservierungen_tab.alle_auswaehlen")}
                </label>
              )}
              <ul className="mt-2 divide-y divide-text-tertiary/10">
                {rs.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 py-2">
                    {r.statut === "aktiv" ? (
                      <input
                        type="checkbox"
                        aria-label={t("boutique:reservierungen_tab.auswaehlen", {
                          name: `${r.membre_info.prenom} ${r.membre_info.nom}`,
                        })}
                        checked={auswahl.has(r.id)}
                        disabled={!modifiable}
                        onChange={() => umschalten(r.id)}
                      />
                    ) : (
                      <span className="w-4" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1 text-xs">
                      <div className="font-medium text-text-primary">
                        {r.membre_info.prenom} {r.membre_info.nom}
                      </div>
                      <div className="text-text-secondary">
                        {r.membre_info.email}
                        {r.variante_label ? ` · ${r.variante_label}` : ""} · {datum(r.created_at)}
                      </div>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">{r.quantite}×</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STIL[r.statut]}`}
                    >
                      {t(`boutique:reservierungen_tab.status.${r.statut}`)}
                    </span>
                    {r.statut === "aktiv" && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={!modifiable}
                          onClick={() => setBlatt({ aktion: "abholen", ids: [r.id] })}
                          className="rounded-cid bg-ca px-2 py-1 text-xs font-medium text-white hover:bg-cad disabled:opacity-40"
                        >
                          {t("boutique:reservierungen_tab.abholen")}
                        </button>
                        <button
                          type="button"
                          disabled={!modifiable}
                          onClick={() => setBlatt({ aktion: "stornieren", ids: [r.id] })}
                          className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs hover:bg-bg-secondary disabled:opacity-40"
                        >
                          {t("boutique:reservierungen_tab.stornieren")}
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {blatt && (
        <AktionsBlatt
          titel={t(`boutique:reservierungen_tab.blatt.${blatt.aktion}.titel`)}
          nummer={t("boutique:reservierungen_tab.blatt.anzahl", { count: blatt.ids.length })}
          folge={t(`boutique:reservierungen_tab.blatt.${blatt.aktion}.folge`)}
          knopf={t(`boutique:reservierungen_tab.blatt.${blatt.aktion}.knopf`)}
          onBestaetigen={() => void ausfuehren()}
          onClose={() => {
            setBlatt(null);
            setFehler(null);
          }}
          laeuft={laeuft}
          fehler={fehler}
          gefahr={blatt.aktion === "stornieren"}
        />
      )}
    </div>
  );
}
