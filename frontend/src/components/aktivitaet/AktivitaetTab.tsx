/**
 * Reiter „Aktivität“ der Rollenverwaltung (Release 20/22/23) : Übersicht, Auffälligkeiten, Nutzung, Journal.
 * Kacheln und IP-Adressen der Übersicht öffnen das Journal mit passendem Filter.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { JournalFilter } from "../../types/aktivitaet";
import AuffaelligkeitenPanel from "./AuffaelligkeitenPanel";
import JournalPanel from "./JournalPanel";
import NutzungPanel from "./NutzungPanel";
import UebersichtPanel from "./UebersichtPanel";

export type Ansicht = "uebersicht" | "auffaelligkeiten" | "nutzung" | "journal";
const ANSICHTEN: Ansicht[] = ["uebersicht", "auffaelligkeiten", "nutzung", "journal"];

export default function AktivitaetTab({ startAnsicht = "uebersicht" }: { startAnsicht?: Ansicht }) {
  const { t } = useTranslation("aktivitaet");
  const [ansicht, setAnsicht] = useState<Ansicht>(startAnsicht);
  const [filter, setFilter] = useState<JournalFilter>({ seite: 1 });

  function imJournalOeffnen(neu: JournalFilter) {
    setFilter({ ...neu, seite: 1 });
    setAnsicht("journal");
  }

  return (
    <div>
      <p className="mb-3 text-xs text-text-tertiary">{t("hinweis")}</p>
      <div className="mb-3 flex gap-2">
        {ANSICHTEN.map((a) => (
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
      {ansicht === "uebersicht" && (
        <UebersichtPanel
          imJournalOeffnen={imJournalOeffnen}
          auffaelligkeitenOeffnen={() => setAnsicht("auffaelligkeiten")}
        />
      )}
      {ansicht === "auffaelligkeiten" && (
        <AuffaelligkeitenPanel imJournalOeffnen={imJournalOeffnen} />
      )}
      {ansicht === "nutzung" && <NutzungPanel />}
      {ansicht === "journal" && <JournalPanel filter={filter} setFilter={setFilter} />}
    </div>
  );
}
