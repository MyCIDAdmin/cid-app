/** Einnahmen von einem Partner (z. B. Sponsoring) — fließen als Einnahmen in das Partner-
 * Reporting ein (Umsatz = Einnahmen + genehmigte Ausgaben). Erfassen/Löschen ab Bureau Admin. */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useCreerEinnahme, useEinnahmen, useLoescheEinnahme } from "../../hooks/usePartner";
import { EINNAHME_ARTEN, type EinnahmeArt } from "../../types/partner";
import { extractApiErrorMessage } from "../../utils/apiError";
import { heuteIso } from "../../utils/datum";
import { formatBetrag } from "../../utils/partner";

const FELD = "w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm";
const LABEL = "mb-1 block text-[10px] uppercase text-text-tertiary";

interface Props {
  partnerId: string;
  schreibbar: boolean;
}

export default function EinnahmenPanel({ partnerId, schreibbar }: Props) {
  const { t, i18n } = useTranslation("partner");
  const einnahmen = useEinnahmen(partnerId);
  const anlegen = useCreerEinnahme();
  const loeschen = useLoescheEinnahme();
  const [datum, setDatum] = useState(heuteIso());
  const [betrag, setBetrag] = useState("");
  const [art, setArt] = useState<EinnahmeArt>("sponsoring");
  const [bezeichnung, setBezeichnung] = useState("");
  const liste = einnahmen.data ?? [];

  function absenden(e: React.FormEvent) {
    e.preventDefault();
    anlegen.mutate(
      { partner: partnerId, datum, betrag: betrag.replace(",", "."), art, bezeichnung },
      {
        onSuccess: () => {
          setBetrag("");
          setBezeichnung("");
        },
      },
    );
  }

  return (
    <section className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
      <h2 className="mb-1 text-sm font-semibold text-text-primary">{t("einnahmen_titel")}</h2>
      <p className="mb-3 text-xs text-text-tertiary">{t("einnahmen_hinweis")}</p>
      {liste.length === 0 && !einnahmen.isLoading && (
        <p className="text-sm text-text-tertiary">{t("keine_einnahmen")}</p>
      )}
      {liste.length > 0 && (
        <ul className="divide-y divide-text-tertiary/10 text-sm">
          {liste.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
              <span className="tabular-nums text-text-secondary">{e.datum}</span>
              <span className="font-medium tabular-nums">
                {formatBetrag(e.betrag, i18n.language)}
              </span>
              <span className="rounded-full bg-bg-tertiary px-2 py-0.5 text-[11px]">
                {t(`einnahme_art_${e.art}`)}
              </span>
              <span className="flex-1 text-text-secondary">{e.bezeichnung}</span>
              {schreibbar && (
                <button
                  type="button"
                  onClick={() => loeschen.mutate(e.id)}
                  disabled={loeschen.isPending}
                  className="text-xs text-status-dangerText hover:underline"
                >
                  {t("entfernen")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {schreibbar && (
        <form
          onSubmit={absenden}
          className="mt-4 grid gap-2 border-t border-text-tertiary/10 pt-4 sm:grid-cols-4"
        >
          <div>
            <label htmlFor="einnahme-datum" className={LABEL}>
              {t("einnahme_datum")}
            </label>
            <input
              id="einnahme-datum"
              type="date"
              required
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
              className={FELD}
            />
          </div>
          <div>
            <label htmlFor="einnahme-betrag" className={LABEL}>
              {t("einnahme_betrag")}
            </label>
            <input
              id="einnahme-betrag"
              inputMode="decimal"
              required
              value={betrag}
              onChange={(e) => setBetrag(e.target.value)}
              className={FELD}
            />
          </div>
          <div>
            <label htmlFor="einnahme-art" className={LABEL}>
              {t("einnahme_art")}
            </label>
            <select
              id="einnahme-art"
              value={art}
              onChange={(e) => setArt(e.target.value as EinnahmeArt)}
              className={FELD}
            >
              {EINNAHME_ARTEN.map((a) => (
                <option key={a} value={a}>
                  {t(`einnahme_art_${a}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="einnahme-bezeichnung" className={LABEL}>
              {t("einnahme_bezeichnung")}
            </label>
            <input
              id="einnahme-bezeichnung"
              value={bezeichnung}
              maxLength={200}
              onChange={(e) => setBezeichnung(e.target.value)}
              className={FELD}
            />
          </div>
          {anlegen.isError && (
            <p className="text-xs text-status-dangerText sm:col-span-4">
              {extractApiErrorMessage(anlegen.error, t("fehler_aktion"))}
            </p>
          )}
          <div className="sm:col-span-4">
            <button
              type="submit"
              disabled={anlegen.isPending}
              className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {t("einnahme_hinzufuegen")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
