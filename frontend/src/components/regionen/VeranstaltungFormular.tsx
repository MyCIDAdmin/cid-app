import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  useVeranstaltungAendern,
  useVeranstaltungAnlegen,
  useVeranstaltungBild,
} from "../../hooks/useRegionen";
import type { Standort, Veranstaltung } from "../../types/regionen";
import { extractApiErrorMessage } from "../../utils/apiError";

const FELD =
  "w-full rounded-cid border border-text-tertiary/20 bg-bg-secondary px-3 py-2 text-sm text-text-primary";

interface Props {
  slug: string;
  standorte: Standort[];
  bestehend?: Veranstaltung;
  onFertig: () => void;
}

export default function VeranstaltungFormular({ slug, standorte, bestehend, onFertig }: Props) {
  const { t } = useTranslation("regionen");
  const anlegen = useVeranstaltungAnlegen();
  const aendern = useVeranstaltungAendern();
  const bildHoch = useVeranstaltungBild();

  const [titel, setTitel] = useState(bestehend?.titel ?? "");
  const [datum, setDatum] = useState(bestehend?.datum ?? "");
  const [uhrzeit, setUhrzeit] = useState(bestehend?.uhrzeit ?? "");
  const [ort, setOrt] = useState(bestehend?.ort ?? "");
  const [standort, setStandort] = useState(bestehend?.standort?.id ?? "");
  const [maximum, setMaximum] = useState(
    bestehend?.max_teilnehmer ? String(bestehend.max_teilnehmer) : "",
  );
  const [beschreibung, setBeschreibung] = useState(bestehend?.beschreibung ?? "");
  const [bild, setBild] = useState<File | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const laeuft = anlegen.isPending || aendern.isPending || bildHoch.isPending;
  const gueltig = titel.trim() && datum && ort.trim();

  function senden(e: FormEvent) {
    e.preventDefault();
    if (!gueltig) return;
    setFehler(null);
    const daten = {
      titel: titel.trim(),
      datum,
      uhrzeit: uhrzeit || null,
      ort: ort.trim(),
      standort: standort || null,
      max_teilnehmer: maximum ? Number(maximum) : null,
      beschreibung: beschreibung.trim(),
    };
    const bei = (err: unknown) => setFehler(extractApiErrorMessage(err, t("fehler_speichern")));
    if (bestehend) {
      aendern.mutate(
        { slug, id: bestehend.id, daten },
        {
          onSuccess: () => {
            if (!bild) return onFertig();
            bildHoch.mutate(
              { slug, id: bestehend.id, datei: bild },
              { onSuccess: onFertig, onError: bei },
            );
          },
          onError: bei,
        },
      );
    } else {
      anlegen.mutate({ slug, daten, bild }, { onSuccess: onFertig, onError: bei });
    }
  }

  return (
    <form
      onSubmit={senden}
      className="flex flex-col gap-3 rounded-cid-lg bg-bg-primary p-4 shadow-sm"
    >
      <label className="text-xs font-semibold text-text-tertiary">
        {t("v_titel")}
        <input
          className={`${FELD} mt-1 font-normal`}
          value={titel}
          maxLength={150}
          onChange={(e) => setTitel(e.target.value)}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-text-tertiary">
          {t("v_datum")}
          <input
            type="date"
            className={`${FELD} mt-1 font-normal`}
            value={datum}
            onChange={(e) => setDatum(e.target.value)}
          />
        </label>
        <label className="text-xs font-semibold text-text-tertiary">
          {t("v_uhrzeit")}
          <input
            type="time"
            className={`${FELD} mt-1 font-normal`}
            value={uhrzeit}
            onChange={(e) => setUhrzeit(e.target.value)}
          />
        </label>
      </div>
      <label className="text-xs font-semibold text-text-tertiary">
        {t("v_ort")}
        <input
          className={`${FELD} mt-1 font-normal`}
          value={ort}
          maxLength={200}
          onChange={(e) => setOrt(e.target.value)}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-text-tertiary">
          {t("feld_standort")}
          <select
            className={`${FELD} mt-1 font-normal`}
            value={standort}
            onChange={(e) => setStandort(e.target.value)}
          >
            <option value="">{t("kein_standort")}</option>
            {standorte.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-text-tertiary">
          {t("v_max")}
          <input
            type="number"
            min={1}
            className={`${FELD} mt-1 font-normal`}
            value={maximum}
            onChange={(e) => setMaximum(e.target.value)}
          />
        </label>
      </div>
      <label className="text-xs font-semibold text-text-tertiary">
        {t("v_beschreibung")}
        <textarea
          className={`${FELD} mt-1 font-normal`}
          rows={4}
          maxLength={4000}
          value={beschreibung}
          onChange={(e) => setBeschreibung(e.target.value)}
        />
      </label>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label={t("v_bild")}
        onChange={(e) => setBild(e.target.files?.[0] ?? null)}
        className="text-xs text-text-primary"
      />
      {fehler && <p className="text-sm text-status-dangerText">{fehler}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!gueltig || laeuft}
          className="rounded-cid bg-ca px-4 py-2 text-sm font-medium text-white hover:bg-cad disabled:opacity-50"
        >
          {bestehend ? t("speichern") : t("v_entwurf_speichern")}
        </button>
        <button
          type="button"
          onClick={onFertig}
          className="rounded-cid px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-secondary"
        >
          {t("abbrechen")}
        </button>
      </div>
    </form>
  );
}
