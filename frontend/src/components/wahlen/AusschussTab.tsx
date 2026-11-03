/**
 * Wahlausschuss : Mitglieder (3 bis 5, nicht selbst Kandidat*innen), Veröffentlichung, Aufbewahrung
 * der Nachweise und die Vier-Augen-Freigabe zum Öffnen und Schließen der Abstimmung.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useWahlAktion } from "../../hooks/useWahlen";
import type { Aufbewahrung, Wahl } from "../../types/wahlen";
import { extractApiErrorMessage } from "../../utils/apiError";
import FreigabeBlock from "./FreigabeBlock";
import MitgliedAuswahl from "./MitgliedAuswahl";

const FRISTEN: Aufbewahrung[] = ["30", "90", "365", "manuell"];

export default function AusschussTab({ wahl }: { wahl: Wahl }) {
  const { t } = useTranslation("wahlen");
  const aktion = useWahlAktion(wahl.id);
  const [fehler, setFehler] = useState("");
  const meldeFehler = (e: unknown) => setFehler(extractApiErrorMessage(e, t("ausschuss.fehler")));
  const geoeffnet = wahl.vote_session !== null;

  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <h3 className="text-sm font-semibold">
          {t("ausschuss.mitglieder", { n: wahl.ausschuss.length })}
        </h3>
        <ul className="space-y-1">
          {wahl.ausschuss.map((a) => (
            <li key={a.membre} className="flex items-center justify-between text-sm">
              <span>{a.name}</span>
              {wahl.kann_verwalten && !geoeffnet && (
                <button
                  type="button"
                  onClick={() => aktion.ausschussWeg.mutate(a.membre, { onError: meldeFehler })}
                  className="text-xs text-status-dangerText underline"
                >
                  {t("ausschuss.entfernen")}
                </button>
              )}
            </li>
          ))}
        </ul>
        {wahl.kann_verwalten && !geoeffnet && wahl.ausschuss.length < 5 && (
          <MitgliedAuswahl
            ariaLabel={t("ausschuss.hinzufuegen")}
            ausgeschlossen={wahl.ausschuss.map((a) => a.membre)}
            onWahl={(m) => aktion.ausschussHinzu.mutate(m.id, { onError: meldeFehler })}
          />
        )}
        {wahl.status === "entwurf" && wahl.kann_verwalten && (
          <button
            type="button"
            onClick={() => aktion.veroeffentlichen.mutate(undefined, { onError: meldeFehler })}
            disabled={wahl.ausschuss.length < 3}
            className="rounded-cid bg-ca px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {t("ausschuss.veroeffentlichen")}
          </button>
        )}
        {wahl.status === "entwurf" && wahl.ausschuss.length < 3 && (
          <p className="text-xs text-text-tertiary">{t("ausschuss.mindestens_drei")}</p>
        )}
      </section>

      <section className="space-y-2 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <h3 className="text-sm font-semibold">{t("ausschuss.aufbewahrung")}</h3>
        <p className="text-xs text-text-secondary">{t("ausschuss.aufbewahrung_hinweis")}</p>
        <select
          value={wahl.aufbewahrung}
          disabled={!wahl.ist_ausschuss && !wahl.kann_verwalten}
          aria-label={t("ausschuss.aufbewahrung")}
          onChange={(e) =>
            aktion.aufbewahrung.mutate(e.target.value as Aufbewahrung, { onError: meldeFehler })
          }
          className="w-full rounded-cid border border-text-tertiary/30 p-2 text-sm"
        >
          {FRISTEN.map((f) => (
            <option key={f} value={f}>
              {t(`aufbewahrung.${f}`)}
            </option>
          ))}
        </select>
      </section>

      <section className="space-y-2 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <h3 className="text-sm font-semibold">{t("ausschuss.abstimmung")}</h3>
        {!geoeffnet && <FreigabeBlock wahl={wahl} art="oeffnen" />}
        {geoeffnet && wahl.vote_status === "ouverte" && (
          <FreigabeBlock wahl={wahl} art="schliessen" />
        )}
        {geoeffnet && (
          <Link to={`/votes?session=${wahl.vote_session}`} className="text-sm text-ca underline">
            {t("ausschuss.zur_abstimmung")}
          </Link>
        )}
      </section>

      {fehler && (
        <p role="alert" className="text-sm text-status-dangerText">
          {fehler}
        </p>
      )}
    </div>
  );
}
