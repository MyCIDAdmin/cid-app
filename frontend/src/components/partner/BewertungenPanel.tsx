import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useBewerten, useBewertungen, useLoescheBewertung } from "../../hooks/usePartner";
import {
  BEWERTUNG_KRITERIEN,
  type BewertungKriterium,
  type PartnerVerknuepfung,
} from "../../types/partner";
import { extractApiErrorMessage } from "../../utils/apiError";
import { Sterne, SterneEingabe } from "./Sterne";

interface Props {
  partnerId: string;
  verknuepfungen: PartnerVerknuepfung[];
  schreibbar: boolean;
}

const START: Record<BewertungKriterium, number> = {
  qualitaet: 0,
  preis_leistung: 0,
  zuverlaessigkeit: 0,
  kommunikation: 0,
};

function BewertungsFormular({ partnerId, verknuepfungen }: Omit<Props, "schreibbar">) {
  const { t } = useTranslation("partner");
  const [noten, setNoten] = useState(START);
  const [kommentar, setKommentar] = useState("");
  const [bezug, setBezug] = useState("");
  const bewerten = useBewerten(partnerId);
  const vollstaendig = BEWERTUNG_KRITERIEN.every((k) => noten[k] >= 1);

  function absenden(e: React.FormEvent) {
    e.preventDefault();
    bewerten.mutate(
      { ...noten, kommentar, verknuepfung: bezug || null },
      {
        onSuccess: () => {
          setNoten(START);
          setKommentar("");
          setBezug("");
        },
      },
    );
  }

  return (
    <form onSubmit={absenden} className="mt-4 border-t border-text-tertiary/10 pt-4">
      <h3 className="mb-2 text-xs font-semibold uppercase text-text-tertiary">
        {t("bewertung_abgeben")}
      </h3>
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {BEWERTUNG_KRITERIEN.map((k) => (
          <SterneEingabe
            key={k}
            name={`bewertung-${k}`}
            label={t(`kriterium_${k}`)}
            wert={noten[k]}
            onChange={(n) => setNoten((alt) => ({ ...alt, [k]: n }))}
          />
        ))}
      </div>
      {verknuepfungen.length > 0 && (
        <div className="mb-3">
          <label
            htmlFor="bewertung-bezug"
            className="mb-1 block text-[10px] uppercase text-text-tertiary"
          >
            {t("bewertung_bezug")}
          </label>
          <select
            id="bewertung-bezug"
            value={bezug}
            onChange={(e) => setBezug(e.target.value)}
            className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          >
            <option value="">{t("bewertung_ohne_bezug")}</option>
            {verknuepfungen.map((v) => (
              <option key={v.id} value={v.id}>
                {t(`ziel_${v.ziel_typ}`)}: {v.ziel_label}
              </option>
            ))}
          </select>
        </div>
      )}
      <label
        htmlFor="bewertung-kommentar"
        className="mb-1 block text-[10px] uppercase text-text-tertiary"
      >
        {t("bewertung_kommentar")}
      </label>
      <textarea
        id="bewertung-kommentar"
        rows={2}
        value={kommentar}
        onChange={(e) => setKommentar(e.target.value)}
        className="mb-3 w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
      />
      {bewerten.isError && (
        <p className="mb-2 text-xs text-status-dangerText">
          {extractApiErrorMessage(bewerten.error, t("fehler_aktion"))}
        </p>
      )}
      <button
        type="submit"
        disabled={!vollstaendig || bewerten.isPending}
        title={!vollstaendig ? t("bewertung_alle_kriterien") : undefined}
        className="rounded-cid bg-ca px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
      >
        {t("bewertung_speichern")}
      </button>
    </form>
  );
}

export default function BewertungenPanel({ partnerId, verknuepfungen, schreibbar }: Props) {
  const { t } = useTranslation("partner");
  const { data } = useBewertungen(partnerId);
  const loeschen = useLoescheBewertung();
  const bewertungen = data ?? [];

  return (
    <section className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-text-primary">{t("bewertungen")}</h2>
      {bewertungen.length === 0 ? (
        <p className="text-sm text-text-tertiary">{t("keine_bewertungen")}</p>
      ) : (
        <ul className="divide-y divide-text-tertiary/10">
          {bewertungen.map((b) => (
            <li key={b.id} className="py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Sterne wert={b.schnitt} />
                <span className="text-xs text-text-secondary">{b.bewerter_name}</span>
                <span className="text-xs text-text-tertiary">
                  {new Date(b.created_at).toLocaleDateString()}
                </span>
                {b.verknuepfung_label && (
                  <span className="rounded-full bg-bg-tertiary px-2 py-0.5 text-[11px]">
                    {b.verknuepfung_label}
                  </span>
                )}
                {schreibbar && (
                  <button
                    type="button"
                    disabled={loeschen.isPending}
                    onClick={() => loeschen.mutate(b.id)}
                    className="ml-auto text-xs text-status-dangerText hover:underline"
                  >
                    {t("entfernen")}
                  </button>
                )}
              </div>
              <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-text-tertiary">
                {BEWERTUNG_KRITERIEN.map((k) => (
                  <span key={k}>
                    {t(`kriterium_${k}`)}: {b[k]}/5
                  </span>
                ))}
              </p>
              {b.kommentar && <p className="mt-1 text-text-secondary">{b.kommentar}</p>}
            </li>
          ))}
        </ul>
      )}
      {loeschen.isError && (
        <p className="mt-2 text-xs text-status-dangerText">
          {extractApiErrorMessage(loeschen.error, t("fehler_aktion"))}
        </p>
      )}
      {schreibbar && <BewertungsFormular partnerId={partnerId} verknuepfungen={verknuepfungen} />}
    </section>
  );
}
