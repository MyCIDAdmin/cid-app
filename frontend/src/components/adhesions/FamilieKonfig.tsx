/** Familienpaket-Einstellungen eines Angebots (R35): Familienrabatt in % und die bestehenden
 * Angebote, die Hauptperson, weiteren Erwachsenen und Kindern zugewiesen werden. Eigener Zustand
 * mit „Speichern“, weil das Backend das Paket nur mit vollständigen Zuweisungen annimmt. */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useModifierOffre } from "../../hooks/useAdhesions";
import type { OffreAdhesion } from "../../types/adhesion";
import { extractApiErrorMessage } from "../../utils/apiError";

type Rolle =
  "familie_angebot_hauptperson" | "familie_angebot_erwachsene" | "familie_angebot_kinder";
const ROLLEN: Rolle[] = [
  "familie_angebot_hauptperson",
  "familie_angebot_erwachsene",
  "familie_angebot_kinder",
];

export default function FamilieKonfig({
  offre,
  angebote,
  modifiable,
}: {
  offre: OffreAdhesion;
  /** Alle Angebote der Kampagne ; zuweisbar sind nur die normalen. */
  angebote: OffreAdhesion[];
  modifiable: boolean;
}) {
  const { t } = useTranslation("adhesions");
  const mutation = useModifierOffre();
  const [aktiv, setAktiv] = useState(offre.ist_familienpaket);
  const [rabatt, setRabatt] = useState(offre.familie_rabatt_pct);
  const [maxErw, setMaxErw] = useState(String(offre.max_erwachsene));
  const [maxKinder, setMaxKinder] = useState(String(offre.max_kinder));
  const [zuweisung, setZuweisung] = useState<Record<Rolle, string>>({
    familie_angebot_hauptperson: offre.familie_angebot_hauptperson ?? "",
    familie_angebot_erwachsene: offre.familie_angebot_erwachsene ?? "",
    familie_angebot_kinder: offre.familie_angebot_kinder ?? "",
  });
  const waehlbar = angebote.filter((a) => a.id !== offre.id && !a.ist_familienpaket);

  function speichern() {
    if (!modifiable) return;
    const payload = aktiv
      ? {
          ist_familienpaket: true,
          familie_rabatt_pct: rabatt || "0",
          max_erwachsene: Number(maxErw),
          max_kinder: Number(maxKinder),
          familie_angebot_hauptperson: zuweisung.familie_angebot_hauptperson || null,
          familie_angebot_erwachsene: zuweisung.familie_angebot_erwachsene || null,
          familie_angebot_kinder: zuweisung.familie_angebot_kinder || null,
        }
      : { ist_familienpaket: false };
    mutation.mutate({ id: offre.id, payload });
  }

  return (
    <div className="w-full rounded-cid bg-bg-tertiary/40 p-2">
      <label className="flex items-center gap-1 text-[10px] text-text-secondary">
        <input
          type="checkbox"
          checked={aktiv}
          onChange={(e) => setAktiv(e.target.checked)}
          disabled={!modifiable}
          aria-label={`${t("admin_offres.familie_label")} — ${offre.nom}`}
        />
        {t("admin_offres.familie_label")}
      </label>
      {aktiv && (
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <p className="text-[10px] text-text-tertiary sm:col-span-3">
            {t("admin_offres.familie_hinweis")}
          </p>
          {ROLLEN.map((rolle) => (
            <label key={rolle} className="text-[10px] text-text-secondary">
              {t(`admin_offres.${rolle}`)}
              <select
                aria-label={`${t(`admin_offres.${rolle}`)} — ${offre.nom}`}
                value={zuweisung[rolle]}
                onChange={(e) => setZuweisung({ ...zuweisung, [rolle]: e.target.value })}
                disabled={!modifiable}
                className="mt-0.5 w-full rounded-cid border border-text-tertiary/30 px-1 py-0.5 text-xs"
              >
                <option value="">{t("admin_offres.familie_kein_angebot")}</option>
                {waehlbar.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nom} ({a.prix_plein} €)
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label className="text-[10px] text-text-secondary">
            {t("admin_offres.familie_rabatt")}
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              aria-label={`${t("admin_offres.familie_rabatt")} — ${offre.nom}`}
              value={rabatt}
              onChange={(e) => setRabatt(e.target.value)}
              disabled={!modifiable}
              className="mt-0.5 w-full rounded-cid border border-text-tertiary/30 px-1 py-0.5 text-xs"
            />
          </label>
          <label className="text-[10px] text-text-secondary">
            {t("admin_offres.familie_max_erwachsene")}
            <input
              type="number"
              min="0"
              step="1"
              aria-label={`${t("admin_offres.familie_max_erwachsene")} — ${offre.nom}`}
              value={maxErw}
              onChange={(e) => setMaxErw(e.target.value)}
              disabled={!modifiable}
              className="mt-0.5 w-full rounded-cid border border-text-tertiary/30 px-1 py-0.5 text-xs"
            />
          </label>
          <label className="text-[10px] text-text-secondary">
            {t("admin_offres.familie_max_kinder")}
            <input
              type="number"
              min="0"
              step="1"
              aria-label={`${t("admin_offres.familie_max_kinder")} — ${offre.nom}`}
              value={maxKinder}
              onChange={(e) => setMaxKinder(e.target.value)}
              disabled={!modifiable}
              className="mt-0.5 w-full rounded-cid border border-text-tertiary/30 px-1 py-0.5 text-xs"
            />
          </label>
        </div>
      )}
      {mutation.isError && (
        <p className="mt-1 text-[10px] text-status-dangerText">
          {extractApiErrorMessage(mutation.error, t("admin_offres.erreur"))}
        </p>
      )}
      {(aktiv || offre.ist_familienpaket) && (
        <button
          type="button"
          onClick={speichern}
          disabled={!modifiable || mutation.isPending}
          className="mt-2 rounded-cid bg-ca px-2 py-1 text-[11px] font-medium text-white hover:bg-cad disabled:opacity-40"
        >
          {t("admin_offres.familie_speichern")}
        </button>
      )}
    </div>
  );
}
