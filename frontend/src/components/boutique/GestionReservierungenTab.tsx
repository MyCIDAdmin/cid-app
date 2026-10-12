/**
 * Tab „Reservierungen" der Shop-Verwaltung (Release 4, 2026-10-12): alle Reservierungen
 * (Modus „nur reservieren") mit Filter nach Produkt/Status; „Abholen" markiert sie als erledigt,
 * „Stornieren" gibt die Menge wieder frei. Es wird nichts gelöscht.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useProduits, useReservierungAktion, useReservierungen } from "../../hooks/useBoutique";
import type { StatutReservierung } from "../../types/boutique";
import { extractApiErrorMessage } from "../../utils/apiError";

const STATUS: StatutReservierung[] = ["aktiv", "abgeholt", "storniert"];
const STATUS_STIL: Record<StatutReservierung, string> = {
  aktiv: "bg-status-warningBg text-status-warningText",
  abgeholt: "bg-status-successBg text-status-successText",
  storniert: "bg-bg-tertiary text-text-secondary",
};

export default function GestionReservierungenTab({ modifiable = true }: { modifiable?: boolean }) {
  const { t } = useTranslation(["boutique", "common"]);
  const [produit, setProduit] = useState("");
  const [statut, setStatut] = useState<StatutReservierung | "">("aktiv");
  const liste = useReservierungen({ produit, statut });
  const produkte = useProduits({});
  const aktion = useReservierungAktion();

  const reservierbar = (produkte.data?.results ?? []).filter(
    (p) => p.reservierung_modus === "nur_reservieren",
  );
  const summe = (liste.data?.results ?? []).reduce((s, r) => s + r.quantite, 0);

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
      </div>

      <div className="overflow-x-auto rounded-cid-lg bg-bg-primary shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-text-tertiary/20 text-left text-xs font-semibold uppercase text-text-tertiary">
              <th className="px-3 py-2">{t("boutique:reservierungen_tab.col_produkt")}</th>
              <th className="px-3 py-2">{t("boutique:reservierungen_tab.col_mitglied")}</th>
              <th className="px-3 py-2">{t("boutique:reservierungen_tab.col_menge")}</th>
              <th className="px-3 py-2">{t("boutique:reservierungen_tab.col_status")}</th>
              <th className="px-3 py-2">{t("boutique:reservierungen_tab.col_datum")}</th>
              <th className="px-3 py-2">{t("boutique:reservierungen_tab.col_aktionen")}</th>
            </tr>
          </thead>
          <tbody>
            {liste.data?.results.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-text-tertiary">
                  {t("boutique:reservierungen_tab.leer")}
                </td>
              </tr>
            )}
            {liste.isError && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-status-dangerText">
                  {t("boutique:reservierungen_tab.fehler")}
                </td>
              </tr>
            )}
            {liste.data?.results.map((r) => (
              <tr key={r.id} className="border-b border-text-tertiary/10 align-top last:border-0">
                <td className="px-3 py-2 text-xs">
                  <div className="font-medium text-text-primary">{r.produit_nom}</div>
                  {r.variante_label && (
                    <div className="text-text-secondary">{r.variante_label}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">
                  <div>
                    {r.membre_info.prenom} {r.membre_info.nom}
                  </div>
                  <div className="text-text-secondary">{r.membre_info.email}</div>
                </td>
                <td className="px-3 py-2 text-sm font-semibold tabular-nums">{r.quantite}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STIL[r.statut]}`}
                  >
                    {t(`boutique:reservierungen_tab.status.${r.statut}`)}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs">{new Date(r.created_at).toLocaleDateString()}</td>
                <td className="px-3 py-2">
                  {r.statut === "aktiv" && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!modifiable || aktion.isPending}
                        onClick={() => aktion.mutate({ id: r.id, aktion: "abholen" })}
                        className="rounded-cid bg-ca px-2 py-1 text-xs font-medium text-white hover:bg-cad disabled:opacity-40"
                      >
                        {t("boutique:reservierungen_tab.abholen")}
                      </button>
                      <button
                        type="button"
                        disabled={!modifiable || aktion.isPending}
                        onClick={() => aktion.mutate({ id: r.id, aktion: "stornieren" })}
                        className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs hover:bg-bg-secondary disabled:opacity-40"
                      >
                        {t("boutique:reservierungen_tab.stornieren")}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {aktion.isError && (
        <p className="mt-2 text-xs text-status-dangerText">
          {extractApiErrorMessage(aktion.error, t("boutique:reservierungen_tab.fehler"))}
        </p>
      )}
    </div>
  );
}
