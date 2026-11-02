/**
 * Wahlbüro (Ausschuss und Büro) : Stimmzettel-Vorschau, Beteiligung (wer, nie wofür) mit Export
 * und die Übergabe-Checkliste nach der Veröffentlichung des Ergebnisses.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { beteiligungExport } from "../../api/wahlen";
import {
  useBeteiligung,
  useUebergabe,
  useUebergabeSetzen,
  useWahlzettel,
} from "../../hooks/useWahlen";
import type { Wahl } from "../../types/wahlen";
import { extractApiErrorMessage } from "../../utils/apiError";

export function Wahlzettel({ wahl }: { wahl: Wahl }) {
  const { t } = useTranslation("wahlen");
  const zettel = useWahlzettel(wahl.id);
  const z = zettel.data;
  if (!z) return null;
  return (
    <section
      className="space-y-2 rounded-cid-lg bg-bg-primary p-4 shadow-sm"
      data-testid="wahlzettel"
    >
      <h3 className="text-sm font-semibold">{t("buero.wahlzettel")}</h3>
      <p className="text-xs text-text-secondary">
        {z.geoeffnet ? t("buero.wahlzettel_offen") : t("buero.wahlzettel_vorschau")}{" "}
        {t(`buero.typ_${z.typ}`, { n: z.stimmen_max })}
      </p>
      {z.optionen.length === 0 ? (
        <p className="text-sm text-text-tertiary">{t("buero.wahlzettel_leer")}</p>
      ) : (
        <ul className="space-y-2">
          {z.optionen.map((o) => (
            <li key={o.label} className="rounded-cid border border-text-tertiary/20 p-2 text-sm">
              <p className="font-medium">{o.label}</p>
              {o.personen.length > 0 && (
                <p className="text-xs text-text-secondary">{o.personen.join(", ")}</p>
              )}
              {o.beschreibung && <p className="text-xs text-text-tertiary">{o.beschreibung}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Beteiligung({ wahl }: { wahl: Wahl }) {
  const { t } = useTranslation("wahlen");
  const beteiligung = useBeteiligung(wahl.id, wahl.vote_session !== null);
  const [fehler, setFehler] = useState("");
  const b = beteiligung.data;
  if (!b) return null;

  async function export_() {
    try {
      const blob = await beteiligungExport(wahl.id);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "beteiligung.csv";
      a.click();
    } catch (e) {
      setFehler(extractApiErrorMessage(e, t("buero.fehler")));
    }
  }

  return (
    <section
      className="space-y-2 rounded-cid-lg bg-bg-primary p-4 shadow-sm"
      data-testid="beteiligung-liste"
    >
      <h3 className="text-sm font-semibold">{t("buero.beteiligung")}</h3>
      <p className="text-xs text-text-secondary">{t("buero.beteiligung_hinweis")}</p>
      <p className="text-sm">
        {t("ergebnis.beteiligung", { a: b.abgegeben, b: b.berechtigt, p: b.prozent })}
      </p>
      <ul className="max-h-64 divide-y divide-text-tertiary/10 overflow-y-auto text-sm">
        {b.eintraege.map((e) => (
          <li key={e.membre} className="flex justify-between gap-2 py-1">
            <span>{e.name}</span>
            <span className={e.hat_gewaehlt ? "text-status-successText" : "text-text-tertiary"}>
              {e.hat_gewaehlt ? t("buero.abgestimmt") : t("buero.offen")}
            </span>
          </li>
        ))}
      </ul>
      <button type="button" onClick={export_} className="text-sm text-ca underline">
        {t("buero.export")}
      </button>
      {fehler && (
        <p role="alert" className="text-xs text-status-dangerText">
          {fehler}
        </p>
      )}
    </section>
  );
}

function Uebergabe({ wahl }: { wahl: Wahl }) {
  const { t } = useTranslation("wahlen");
  const stand = useUebergabe(wahl.id, wahl.ergebnis_freigegeben);
  const setzen = useUebergabeSetzen(wahl.id);
  const [fehler, setFehler] = useState("");
  if (!wahl.ergebnis_freigegeben) return null;
  const punkte = stand.data ?? [];
  const erledigt = punkte.filter((p) => p.erledigt).length;

  return (
    <section
      className="space-y-2 rounded-cid-lg bg-bg-primary p-4 shadow-sm"
      data-testid="uebergabe"
    >
      <h3 className="text-sm font-semibold">{t("buero.uebergabe")}</h3>
      <p className="text-xs text-text-secondary">
        {t("buero.uebergabe_stand", { n: erledigt, max: punkte.length })}
      </p>
      <ul className="space-y-1">
        {punkte.map((p) => (
          <li key={p.schluessel} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={p.erledigt}
              disabled={p.automatisch || setzen.isPending}
              aria-label={t(`buero.punkt.${p.schluessel}`)}
              onChange={(e) =>
                setzen.mutate(
                  { schluessel: p.schluessel, erledigt: e.target.checked },
                  { onError: (err) => setFehler(extractApiErrorMessage(err, t("buero.fehler"))) },
                )
              }
              className="mt-1"
            />
            <span>
              {t(`buero.punkt.${p.schluessel}`)}
              {p.automatisch && (
                <span className="ml-1 text-xs text-text-tertiary">({t("buero.automatisch")})</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {fehler && (
        <p role="alert" className="text-xs text-status-dangerText">
          {fehler}
        </p>
      )}
    </section>
  );
}

export default function WahlbueroTab({ wahl }: { wahl: Wahl }) {
  return (
    <div className="space-y-4">
      <Beteiligung wahl={wahl} />
      <Uebergabe wahl={wahl} />
    </div>
  );
}
