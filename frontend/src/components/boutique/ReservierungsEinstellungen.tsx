/**
 * Reservierungs-Einstellungen eines Produkts in der Shop-Verwaltung (Release 4, 2026-10-12):
 * Modus (keine / nur reservieren / reservieren + online bezahlen), Frist, Gesamtmenge und Menge
 * pro Mitglied. Gespeichert wird mit einem Klick auf „Speichern" (PATCH des Produkts).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useModifierProduit } from "../../hooks/useBoutique";
import type { Produit, ReservierungsModus } from "../../types/boutique";
import { extractApiErrorMessage } from "../../utils/apiError";

const MODI: ReservierungsModus[] = ["aus", "nur_reservieren", "reservieren_und_bezahlen"];
const FELD =
  "w-full rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs disabled:opacity-40";

/** ISO-Zeitpunkt -> Wert für <input type="datetime-local"> (lokale Zeit). */
function zuLokal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ReservierungsEinstellungen({
  produit,
  modifiable,
}: {
  produit: Produit;
  modifiable: boolean;
}) {
  const { t } = useTranslation(["boutique", "common"]);
  const speichern = useModifierProduit();
  const [modus, setModus] = useState(produit.reservierung_modus);
  const [frist, setFrist] = useState(zuLokal(produit.reservierung_frist));
  const [maxGesamt, setMaxGesamt] = useState(String(produit.reservierung_max_gesamt ?? ""));
  const [maxMitglied, setMaxMitglied] = useState(
    String(produit.reservierung_max_pro_mitglied ?? ""),
  );
  const [zahlungsfrist, setZahlungsfrist] = useState(
    String(produit.reservierung_zahlungsfrist_tage ?? ""),
  );
  const [gespeichert, setGespeichert] = useState(false);
  const ohne = modus === "aus";
  const mitZahlung = modus === "reservieren_und_bezahlen";

  function onSpeichern() {
    setGespeichert(false);
    speichern.mutate(
      {
        id: produit.id,
        payload: {
          reservierung_modus: modus,
          reservierung_frist: ohne || !frist ? null : new Date(frist).toISOString(),
          reservierung_max_gesamt: ohne || !maxGesamt ? null : Number(maxGesamt),
          reservierung_max_pro_mitglied: ohne || !maxMitglied ? null : Number(maxMitglied),
          reservierung_zahlungsfrist_tage:
            !mitZahlung || !zahlungsfrist ? null : Number(zahlungsfrist),
        },
      },
      { onSuccess: () => setGespeichert(true) },
    );
  }

  return (
    <div className="mt-2 rounded-cid border border-text-tertiary/20 bg-bg-secondary p-3">
      <div className="mb-2 text-xs font-semibold text-text-primary">
        {t("boutique:reservierung_admin.titel")}
      </div>
      <div className="grid gap-2 md:grid-cols-4">
        <label className="text-[11px] text-text-secondary md:col-span-2">
          {t("boutique:reservierung_admin.modus")}
          <select
            value={modus}
            disabled={!modifiable}
            onChange={(e) => setModus(e.target.value as ReservierungsModus)}
            className={FELD}
          >
            {MODI.map((m) => (
              <option key={m} value={m}>
                {t(`boutique:reservierung_admin.modus_${m}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-text-secondary md:col-span-2">
          {t("boutique:reservierung_admin.frist")}
          <input
            type="datetime-local"
            value={frist}
            disabled={!modifiable || ohne}
            onChange={(e) => setFrist(e.target.value)}
            className={FELD}
          />
        </label>
        <label className="text-[11px] text-text-secondary md:col-span-2">
          {t("boutique:reservierung_admin.max_gesamt")}
          <input
            type="number"
            min={1}
            value={maxGesamt}
            disabled={!modifiable || ohne}
            onChange={(e) => setMaxGesamt(e.target.value)}
            className={FELD}
          />
        </label>
        <label className="text-[11px] text-text-secondary md:col-span-2">
          {t("boutique:reservierung_admin.max_pro_mitglied")}
          <input
            type="number"
            min={1}
            value={maxMitglied}
            disabled={!modifiable || ohne}
            onChange={(e) => setMaxMitglied(e.target.value)}
            className={FELD}
          />
        </label>
        <label className="text-[11px] text-text-secondary md:col-span-2">
          {t("boutique:reservierung_admin.zahlungsfrist_tage")}
          <input
            type="number"
            min={1}
            max={90}
            value={zahlungsfrist}
            disabled={!modifiable || !mitZahlung}
            onChange={(e) => setZahlungsfrist(e.target.value)}
            className={FELD}
          />
        </label>
      </div>
      <p className="mt-2 text-[11px] text-text-tertiary">
        {t(`boutique:reservierung_admin.hinweis_${modus}`)}
      </p>
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={onSpeichern}
          disabled={!modifiable || speichern.isPending}
          title={!modifiable ? (t("common:acces.lecture_seule_tooltip") ?? "") : ""}
          className="rounded-cid bg-ca px-3 py-1 text-xs font-medium text-white hover:bg-cad disabled:opacity-40"
        >
          {t("boutique:reservierung_admin.speichern")}
        </button>
        {gespeichert && (
          <span className="text-xs text-status-successText">
            {t("boutique:reservierung_admin.gespeichert")}
          </span>
        )}
        {speichern.isError && (
          <span className="text-xs text-status-dangerText">
            {extractApiErrorMessage(speichern.error, t("boutique:reservierung_admin.fehler"))}
          </span>
        )}
      </div>
    </div>
  );
}
