import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useVeranstaltungen } from "../../hooks/useRegionen";
import type { Standort } from "../../types/regionen";
import VeranstaltungFormular from "./VeranstaltungFormular";
import VeranstaltungKarte from "./VeranstaltungKarte";

/** Regionale Treffen : alle Konten sehen veröffentlichte, Verantwortliche und Büro auch Entwürfe. */
export default function VeranstaltungenBereich({
  slug,
  standorte,
  darfAnlegen,
}: {
  slug: string;
  standorte: Standort[];
  darfAnlegen: boolean;
}) {
  const { t } = useTranslation("regionen");
  const { data, isLoading, isError } = useVeranstaltungen(slug);
  const [neu, setNeu] = useState(false);

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-text-primary">{t("veranstaltungen")}</h2>
        {darfAnlegen && !neu && (
          <button
            type="button"
            onClick={() => setNeu(true)}
            className="rounded-cid bg-ca px-3 py-1.5 text-xs font-medium text-white hover:bg-cad"
          >
            {t("v_neu")}
          </button>
        )}
      </div>
      {neu && (
        <div className="mb-4">
          <VeranstaltungFormular slug={slug} standorte={standorte} onFertig={() => setNeu(false)} />
        </div>
      )}
      {isLoading && <p className="text-sm text-text-tertiary">{t("laden")}</p>}
      {isError && <p className="text-sm text-status-dangerText">{t("fehler_veranstaltungen")}</p>}
      {data && data.length === 0 && (
        <p className="text-sm text-text-tertiary">{t("keine_veranstaltungen")}</p>
      )}
      {data && data.length > 0 && (
        <ul className="flex flex-col gap-4">
          {data.map((v) => (
            <VeranstaltungKarte key={v.id} v={v} standorte={standorte} />
          ))}
        </ul>
      )}
    </section>
  );
}
