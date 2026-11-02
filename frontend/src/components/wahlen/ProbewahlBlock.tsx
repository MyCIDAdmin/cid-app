/**
 * Probewahl (Ausschuss und Büro) : ein Trockenlauf mit erfundenen Stimmen vor dem Start. Der
 * Server wertet mit derselben Logik aus wie bei der echten Wahl und speichert nichts; niemand wird
 * benachrichtigt. Dazu eine Startbereitschaft: was fehlt noch, bevor die Wahl geöffnet werden kann?
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useProbewahl } from "../../hooks/useWahlen";
import type { ProbeSzenario, Wahl } from "../../types/wahlen";
import { extractApiErrorMessage } from "../../utils/apiError";
import { Zahlen } from "./ErgebnisTab";

const SZENARIEN: ProbeSzenario[] = ["zufall", "gleichstand"];

export default function ProbewahlBlock({ wahl }: { wahl: Wahl }) {
  const { t } = useTranslation("wahlen");
  const probe = useProbewahl(wahl.id);
  const [stimmen, setStimmen] = useState(40);
  const [szenario, setSzenario] = useState<ProbeSzenario>("zufall");
  const [fehler, setFehler] = useState("");
  const d = probe.data;

  return (
    <section
      className="space-y-3 rounded-cid-lg bg-bg-primary p-4 shadow-sm"
      data-testid="probewahl"
    >
      <h3 className="text-sm font-semibold">{t("probe.titel")}</h3>
      <p className="text-xs text-text-secondary">{t("probe.einleitung")}</p>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1 text-xs">
          {t("probe.stimmen")}
          <input
            type="number"
            min={4}
            max={500}
            value={stimmen}
            onChange={(e) => setStimmen(Number(e.target.value))}
            className="w-24 rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          {t("probe.szenario")}
          <select
            value={szenario}
            onChange={(e) => setSzenario(e.target.value as ProbeSzenario)}
            className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
          >
            {SZENARIEN.map((s) => (
              <option key={s} value={s}>
                {t(`probe.szenario_${s}`)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={probe.isPending}
          onClick={() => {
            setFehler("");
            probe.mutate(
              { stimmen, szenario },
              { onError: (e) => setFehler(extractApiErrorMessage(e, t("probe.fehler"))) },
            );
          }}
          className="rounded-cid bg-ca px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {t("probe.starten")}
        </button>
      </div>
      {fehler && (
        <p role="alert" className="text-xs text-status-dangerText">
          {fehler}
        </p>
      )}
      {d && (
        <div className="space-y-3" data-testid="probe-ergebnis">
          <p className="rounded-cid bg-bg-secondary p-2 text-xs">{t("probe.erfunden")}</p>
          {d.beispiel && <p className="text-xs text-text-secondary">{t("probe.beispiel")}</p>}
          <Zahlen e={d.ergebnis} />
          {d.weiterer_wahlgang && (
            <p className="text-xs text-text-secondary" data-testid="probe-weiter">
              {t("probe.weiterer_wahlgang")}
            </p>
          )}
          <div>
            <h4 className="text-xs font-semibold uppercase text-text-tertiary">
              {t("probe.bereitschaft")}
            </h4>
            <ul className="mt-1 space-y-1 text-sm">
              {d.bereitschaft.map((b) => (
                <li key={b.schluessel} data-testid={`bereit-${b.schluessel}`}>
                  <span aria-hidden="true">{b.ok ? "✓" : "✗"}</span>{" "}
                  <span className="sr-only">{b.ok ? t("probe.ok") : t("probe.offen")}</span>
                  {t(`probe.pruefung.${b.schluessel}`, { n: b.anzahl ?? 0 })}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
