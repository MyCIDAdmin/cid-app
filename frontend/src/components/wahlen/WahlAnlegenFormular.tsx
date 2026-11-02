import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useWahlAnlegen } from "../../hooks/useWahlen";
import type { Mehrheit, Wahl, Wahlform, WahlPayload } from "../../types/wahlen";
import { extractApiErrorMessage } from "../../utils/apiError";
import { inTagen } from "../../utils/wahlen";

const FORMEN: Wahlform[] = ["liste", "person", "mehrfach", "ja_nein", "rang"];
const MEHRHEITEN: Mehrheit[] = ["relativ", "absolut", "zwei_drittel"];

const TERMIN_FELDER = [
  ["ankuendigung_am", "date"],
  ["kandidatur_von", "date"],
  ["kandidatur_bis", "date"],
  ["pruefung_bis", "date"],
  ["kampagne_bis", "date"],
  ["wahl_von", "datetime-local"],
  ["wahl_bis", "datetime-local"],
  ["einspruch_bis", "date"],
  ["uebergabe_bis", "date"],
] as const;

type Eingabe = Omit<WahlPayload, "listen_groesse" | "posten"> & {
  listen_groesse: number;
  posten: number;
};

function vorgabe(): Eingabe {
  return {
    titel: "",
    beschreibung: "",
    form: "liste",
    mehrheit: "absolut",
    listen_groesse: 3,
    posten: 1,
    ankuendigung_am: inTagen(7),
    kandidatur_von: inTagen(14),
    kandidatur_bis: inTagen(28),
    pruefung_bis: inTagen(35),
    kampagne_bis: inTagen(49),
    wahl_von: inTagen(50, 9),
    wahl_bis: inTagen(57, 20),
    einspruch_bis: inTagen(62),
    uebergabe_bis: inTagen(90),
  };
}

export default function WahlAnlegenFormular({ onFertig }: { onFertig: (wahl: Wahl) => void }) {
  const { t } = useTranslation("wahlen");
  const anlegen = useWahlAnlegen();
  const [werte, setWerte] = useState<Eingabe>(vorgabe);
  const [fehler, setFehler] = useState("");

  const setze = <K extends keyof Eingabe>(feld: K, wert: Eingabe[K]) =>
    setWerte((alt) => ({ ...alt, [feld]: wert }));

  function absenden(e: React.FormEvent) {
    e.preventDefault();
    setFehler("");
    const payload = {
      ...werte,
      wahl_von: new Date(werte.wahl_von).toISOString(),
      wahl_bis: new Date(werte.wahl_bis).toISOString(),
    };
    anlegen.mutate(payload, {
      onSuccess: onFertig,
      onError: (err) => setFehler(extractApiErrorMessage(err, t("anlegen.fehler"))),
    });
  }

  const feld = "w-full rounded-cid border border-text-tertiary/30 p-2 text-sm";
  return (
    <form
      onSubmit={absenden}
      className="space-y-3 rounded-cid-lg bg-bg-primary p-4 shadow-sm"
      data-testid="wahl-anlegen"
    >
      <h2 className="text-base font-bold text-text-primary">{t("anlegen.titel")}</h2>
      <label className="block text-sm">
        <span className="text-text-secondary">{t("anlegen.name")}</span>
        <input
          required
          maxLength={200}
          value={werte.titel}
          onChange={(e) => setze("titel", e.target.value)}
          className={feld}
        />
      </label>
      <label className="block text-sm">
        <span className="text-text-secondary">{t("anlegen.beschreibung")}</span>
        <textarea
          rows={2}
          value={werte.beschreibung}
          onChange={(e) => setze("beschreibung", e.target.value)}
          className={feld}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-text-secondary">{t("anlegen.form")}</span>
          <select
            value={werte.form}
            onChange={(e) => setze("form", e.target.value as Wahlform)}
            className={feld}
          >
            {FORMEN.map((f) => (
              <option key={f} value={f}>
                {t(`form.${f}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-text-secondary">{t("anlegen.mehrheit")}</span>
          <select
            value={werte.mehrheit}
            onChange={(e) => setze("mehrheit", e.target.value as Mehrheit)}
            className={feld}
          >
            {MEHRHEITEN.map((m) => (
              <option key={m} value={m}>
                {t(`mehrheit.${m}`)}
              </option>
            ))}
          </select>
        </label>
        {werte.form === "liste" && (
          <label className="block text-sm">
            <span className="text-text-secondary">{t("anlegen.listen_groesse")}</span>
            <input
              type="number"
              min={1}
              max={7}
              value={werte.listen_groesse}
              onChange={(e) => setze("listen_groesse", Number(e.target.value))}
              className={feld}
            />
          </label>
        )}
        {werte.form === "mehrfach" && (
          <label className="block text-sm">
            <span className="text-text-secondary">{t("anlegen.posten")}</span>
            <input
              type="number"
              min={1}
              max={20}
              value={werte.posten}
              onChange={(e) => setze("posten", Number(e.target.value))}
              className={feld}
            />
          </label>
        )}
      </div>
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-1 text-sm font-semibold text-text-primary">
          {t("anlegen.zeitplan")}
        </legend>
        {TERMIN_FELDER.map(([name, art]) => (
          <label key={name} className="block text-xs">
            <span className="text-text-secondary">{t(`termine.${name}`)}</span>
            <input
              required
              type={art}
              value={werte[name]}
              onChange={(e) => setze(name, e.target.value)}
              className={feld}
            />
          </label>
        ))}
      </fieldset>
      {fehler && (
        <p role="alert" className="text-sm text-status-dangerText">
          {fehler}
        </p>
      )}
      <button
        type="submit"
        disabled={anlegen.isPending}
        className="rounded-cid bg-ca px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {t("anlegen.speichern")}
      </button>
    </form>
  );
}
