/** Neue Terminfindung „Wann passt es euch?“ (Release 18) : mehrere Vorschläge + Teilnehmer. */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { hintergrundKlick, useEscapeSchliessen } from "../../hooks/useEscapeSchliessen";
import { useUmfrageErstellen } from "../../hooks/useKalender";
import type { Person } from "../../types/kalender";
import { extractApiErrorMessage } from "../../utils/apiError";
import { vonLokalInput } from "../../utils/kalender";
import PersonenWahl from "./PersonenWahl";

const FELD = "w-full rounded-cid border border-text-tertiary/30 bg-bg-primary px-2 py-1.5 text-sm";

export default function TerminfindungFormular({ onFertig }: { onFertig: () => void }) {
  const { t } = useTranslation("kalender");
  useEscapeSchliessen(onFertig);
  const erstellen = useUmfrageErstellen();
  const [titel, setTitel] = useState("");
  const [ort, setOrt] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [dauer, setDauer] = useState("90");
  const [antwortBis, setAntwortBis] = useState("");
  const [optionen, setOptionen] = useState<string[]>(["", ""]);
  const [teilnehmer, setTeilnehmer] = useState<Person[]>([]);
  const [fehler, setFehler] = useState("");

  async function speichern(e: React.FormEvent) {
    e.preventDefault();
    setFehler("");
    const zeiten = optionen.filter(Boolean).map((o) => ({ beginn: vonLokalInput(o) ?? "" }));
    try {
      await erstellen.mutateAsync({
        titel: titel.trim(),
        beschreibung,
        ort,
        dauer_minuten: Number(dauer) || 60,
        kategorie: "sitzung",
        sichtbarkeit: "kreis",
        kreis: "bureau",
        projekt: null,
        antwort_bis: antwortBis || null,
        optionen: zeiten,
        teilnehmer: teilnehmer.map((p) => p.user),
      });
      onFertig();
    } catch (err) {
      setFehler(extractApiErrorMessage(err, t("fehler_speichern")));
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="findung-titel"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      {...hintergrundKlick(onFertig)}
    >
      <form
        onSubmit={speichern}
        className="max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-cid-lg bg-bg-primary p-5 shadow-xl"
      >
        <h2 id="findung-titel" className="text-base font-semibold text-text-primary">
          {t("findung.neu")}
        </h2>
        <input
          required
          className={FELD}
          aria-label={t("form.titel")}
          placeholder={t("form.titel")}
          value={titel}
          onChange={(e) => setTitel(e.target.value)}
        />
        <textarea
          className={FELD}
          aria-label={t("form.beschreibung")}
          placeholder={t("form.beschreibung")}
          value={beschreibung}
          onChange={(e) => setBeschreibung(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            className={FELD}
            aria-label={t("form.ort")}
            placeholder={t("form.ort")}
            value={ort}
            onChange={(e) => setOrt(e.target.value)}
          />
          <input
            type="number"
            min={15}
            step={15}
            className={FELD}
            aria-label={t("findung.dauer")}
            value={dauer}
            onChange={(e) => setDauer(e.target.value)}
          />
        </div>
        <div>
          <p className="mb-1 text-xs font-bold text-text-tertiary">{t("findung.vorschlaege")}</p>
          <div className="space-y-1">
            {optionen.map((o, i) => (
              <input
                key={i}
                type="datetime-local"
                className={FELD}
                aria-label={t("findung.vorschlag", { nr: i + 1 })}
                value={o}
                onChange={(e) =>
                  setOptionen((l) => l.map((x, j) => (j === i ? e.target.value : x)))
                }
              />
            ))}
          </div>
          <button
            type="button"
            className="mt-1 text-xs text-ca underline"
            onClick={() => setOptionen((l) => [...l, ""])}
          >
            + {t("findung.vorschlag_hinzu")}
          </button>
        </div>
        <div>
          <p className="mb-1 text-xs font-bold text-text-tertiary">{t("findung.teilnehmer")}</p>
          <PersonenWahl gewaehlt={teilnehmer} onChange={setTeilnehmer} />
        </div>
        <label className="block text-xs text-text-tertiary">
          {t("findung.antwort_bis")}
          <input
            type="date"
            className={`${FELD} mt-1`}
            value={antwortBis}
            onChange={(e) => setAntwortBis(e.target.value)}
          />
        </label>
        {fehler && <p className="text-xs text-status-dangerText">{fehler}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onFertig}
            className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm"
          >
            {t("abbrechen")}
          </button>
          <button
            type="submit"
            disabled={erstellen.isPending}
            className="rounded-cid bg-ca px-3 py-1.5 text-sm font-semibold text-white"
          >
            {t("findung.senden")}
          </button>
        </div>
      </form>
    </div>
  );
}
