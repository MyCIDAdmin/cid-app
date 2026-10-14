/**
 * Reiter „Aktivität“ der Rollenverwaltung (Release 20) : Übersicht und Journal des Protokolls.
 * Kacheln und IP-Adressen der Übersicht öffnen das Journal mit passendem Filter.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { JournalFilter } from "../../types/aktivitaet";
import JournalPanel from "./JournalPanel";
import UebersichtPanel from "./UebersichtPanel";

type Ansicht = "uebersicht" | "journal";

export default function AktivitaetTab() {
  const { t } = useTranslation("aktivitaet");
  const [ansicht, setAnsicht] = useState<Ansicht>("uebersicht");
  const [filter, setFilter] = useState<JournalFilter>({ seite: 1 });

  function imJournalOeffnen(neu: JournalFilter) {
    setFilter({ ...neu, seite: 1 });
    setAnsicht("journal");
  }

  return (
    <div>
      <p className="mb-3 text-xs text-text-tertiary">{t("hinweis")}</p>
      <div className="mb-3 flex gap-2">
        {(["uebersicht", "journal"] as const).map((a) => (
          <button
            key={a}
            type="button"
            aria-pressed={ansicht === a}
            onClick={() => setAnsicht(a)}
            className={`rounded-cid-lg px-3 py-1 text-xs font-medium ${
              ansicht === a ? "bg-ca text-white" : "bg-bg-tertiary text-text-secondary"
            }`}
          >
            {t(`ansicht.${a}`)}
          </button>
        ))}
      </div>
      {ansicht === "uebersicht" ? (
        <UebersichtPanel imJournalOeffnen={imJournalOeffnen} />
      ) : (
        <JournalPanel filter={filter} setFilter={setFilter} />
      )}
    </div>
  );
}
