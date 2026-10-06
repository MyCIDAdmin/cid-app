/**
 * Schaltfläche + Dialog "Übersetzungen" für die Verwaltung (Nutzerwunsch 2026-10-06) : zeigt je
 * Textfeld den Originaltext und die gespeicherten Übersetzungen (DeepL, beim Speichern des
 * Objekts erzeugt), erlaubt manuelle Korrekturen und ein erneutes Übersetzen mit DeepL.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  getUebersetzungen,
  speichereUebersetzung,
  uebersetzeNeu,
  type UebersetzungDaten,
  type UebersetzungSprache,
} from "../../api/uebersetzung";
import { extractApiErrorMessage } from "../../utils/apiError";
import { texteBrutDepuisHtml } from "../../utils/html";

const SPRACHEN: UebersetzungSprache[] = ["de", "fr", "ar"];

interface Props {
  /** "app_label.modellname", z. B. "projets.projet". */
  modell: string;
  objektId: string;
  className?: string;
}

export default function UebersetzungenButton({ modell, objektId, className }: Props) {
  const { t } = useTranslation("common");
  const [offen, setOffen] = useState(false);
  const [daten, setDaten] = useState<UebersetzungDaten | null>(null);
  const [entwuerfe, setEntwuerfe] = useState<Record<string, string>>({});
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);

  function uebernehmen(neu: UebersetzungDaten) {
    setDaten(neu);
    const werte: Record<string, string> = {};
    for (const f of neu.felder) {
      for (const s of SPRACHEN) werte[`${f.feld}|${s}`] = f.sprachen[s].text;
    }
    setEntwuerfe(werte);
  }

  async function oeffnen() {
    setOffen(true);
    setFehler(null);
    setHinweis(null);
    try {
      uebernehmen(await getUebersetzungen(modell, objektId));
    } catch (err) {
      setFehler(extractApiErrorMessage(err, t("uebersetzung.fehler")));
    }
  }

  async function speichern(feld: string, sprache: UebersetzungSprache) {
    setLaeuft(true);
    setFehler(null);
    try {
      uebernehmen(
        await speichereUebersetzung(modell, objektId, {
          feld,
          sprache,
          text: entwuerfe[`${feld}|${sprache}`] ?? "",
        }),
      );
      setHinweis(t("uebersetzung.gespeichert"));
    } catch (err) {
      setFehler(extractApiErrorMessage(err, t("uebersetzung.fehler")));
    } finally {
      setLaeuft(false);
    }
  }

  async function neuUebersetzen() {
    setLaeuft(true);
    setFehler(null);
    try {
      uebernehmen(await uebersetzeNeu(modell, objektId));
      setHinweis(t("uebersetzung.neu_fertig"));
    } catch (err) {
      setFehler(extractApiErrorMessage(err, t("uebersetzung.fehler")));
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={oeffnen}
        className={
          className ??
          "rounded-cid px-3 py-1 text-xs font-medium text-text-secondary hover:bg-bg-secondary"
        }
      >
        {t("uebersetzung.button")}
      </button>
      {offen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("uebersetzung.titel")}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-cid-lg bg-bg-primary p-5 shadow-xl">
            <h2 className="text-base font-semibold text-text-primary">{t("uebersetzung.titel")}</h2>
            <p className="mt-1 text-xs text-text-tertiary">{t("uebersetzung.erklaerung")}</p>
            {daten && !daten.aktiv && (
              <p className="mt-2 rounded-cid bg-status-warningBg p-2 text-xs text-status-warningText">
                {t("uebersetzung.inaktiv")}
              </p>
            )}
            {fehler && <p className="mt-2 text-xs text-status-dangerText">{fehler}</p>}
            {hinweis && <p className="mt-2 text-xs text-status-successText">{hinweis}</p>}

            {daten?.felder.map((f) => (
              <fieldset
                key={f.feld}
                className="mt-4 rounded-cid border border-text-tertiary/20 p-3"
              >
                <legend className="px-1 text-sm font-semibold text-text-primary">
                  {t(`uebersetzung.felder.${f.feld}`, { defaultValue: f.feld })}
                </legend>
                <div className="mb-2 text-xs text-text-tertiary">
                  <span className="font-medium">{t("uebersetzung.original")}: </span>
                  {f.html ? texteBrutDepuisHtml(f.original) : f.original}
                </div>
                {SPRACHEN.map((s) => (
                  <div key={s} className="mb-2">
                    <label
                      htmlFor={`uebers-${f.feld}-${s}`}
                      className="mb-0.5 flex items-center gap-2 text-[11px] uppercase text-text-tertiary"
                    >
                      {t(`uebersetzung.sprachen.${s}`)}
                      {f.sprachen[s].text && (
                        <span className="normal-case">
                          (
                          {f.sprachen[s].automatisch
                            ? t("uebersetzung.automatisch")
                            : t("uebersetzung.manuell")}
                          )
                        </span>
                      )}
                    </label>
                    <textarea
                      id={`uebers-${f.feld}-${s}`}
                      dir={s === "ar" ? "rtl" : "ltr"}
                      rows={f.html ? 4 : 2}
                      value={entwuerfe[`${f.feld}|${s}`] ?? ""}
                      onChange={(e) =>
                        setEntwuerfe((alt) => ({ ...alt, [`${f.feld}|${s}`]: e.target.value }))
                      }
                      className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
                    />
                    <button
                      type="button"
                      disabled={
                        laeuft || (entwuerfe[`${f.feld}|${s}`] ?? "") === f.sprachen[s].text
                      }
                      onClick={() => speichern(f.feld, s)}
                      className="mt-1 rounded-cid bg-ca px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
                    >
                      {t("uebersetzung.speichern")}
                    </button>
                  </div>
                ))}
              </fieldset>
            ))}

            <div className="mt-4 flex justify-between gap-2">
              <button
                type="button"
                disabled={laeuft || !daten?.aktiv}
                onClick={neuUebersetzen}
                className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-xs font-medium text-text-secondary disabled:opacity-40"
              >
                {laeuft ? t("uebersetzung.laeuft") : t("uebersetzung.neu")}
              </button>
              <button
                type="button"
                onClick={() => setOffen(false)}
                className="rounded-cid px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-secondary"
              >
                {t("uebersetzung.schliessen")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
