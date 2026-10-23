import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  useVeranstaltungAendern,
  useVeranstaltungAnlegen,
  useStandortFuerRegionAnlegen,
  useVeranstaltungBild,
} from "../../hooks/useRegionen";
import type { Standort, Veranstaltung } from "../../types/regionen";
import { extractApiErrorMessage } from "../../utils/apiError";
import { klartext } from "../../utils/formattext";
import RichTextEditor from "../ui/RichTextEditor";

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
  const standortAnlegen = useStandortFuerRegionAnlegen();
  const [neuerStandort, setNeuerStandort] = useState("");
  const [neuOffen, setNeuOffen] = useState(false);

  const [titel, setTitel] = useState(bestehend?.titel ?? "");
  const [datum, setDatum] = useState(bestehend?.datum ?? "");
  const [uhrzeit, setUhrzeit] = useState(bestehend?.uhrzeit ?? "");
  const [ort, setOrt] = useState(bestehend?.ort ?? "");
  const [ortMapsUrl, setOrtMapsUrl] = useState(bestehend?.ort_maps_url ?? "");
  const [standort, setStandort] = useState(bestehend?.standort?.id ?? "");
  const [maximum, setMaximum] = useState(
    bestehend?.max_teilnehmer ? String(bestehend.max_teilnehmer) : "",
  );
  const [ticketAktiv, setTicketAktiv] = useState(bestehend?.ticket_aktiv ?? false);
  const [beschreibung, setBeschreibung] = useState(bestehend?.beschreibung ?? "");
  const [bild, setBild] = useState<File | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const laeuft = anlegen.isPending || aendern.isPending || bildHoch.isPending;
  const gueltig = titel.trim() && datum && ort.trim();

  function standortHinzufuegen() {
    const name = neuerStandort.trim();
    if (!name) return;
    setFehler(null);
    standortAnlegen.mutate(
      { slug, name },
      {
        onSuccess: (neu) => {
          setStandort(neu.id);
          setNeuerStandort("");
          setNeuOffen(false);
        },
        onError: (err) => setFehler(extractApiErrorMessage(err, t("fehler_speichern"))),
      },
    );
  }

  function senden(e: FormEvent) {
    e.preventDefault();
    if (!gueltig) return;
    setFehler(null);
    const daten = {
      titel: titel.trim(),
      datum,
      uhrzeit: uhrzeit || null,
      ort: ort.trim(),
      ort_maps_url: ortMapsUrl.trim(),
      standort: standort || null,
      max_teilnehmer: maximum ? Number(maximum) : null,
      ticket_aktiv: ticketAktiv,
      beschreibung: klartext(beschreibung) ? beschreibung.trim() : "",
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
      <label className="text-xs font-semibold text-text-tertiary">
        {t("v_ort_maps_url")}
        <input
          type="url"
          className={`${FELD} mt-1 font-normal`}
          value={ortMapsUrl}
          maxLength={500}
          placeholder="https://maps.app.goo.gl/…"
          onChange={(e) => setOrtMapsUrl(e.target.value)}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
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
          {neuOffen ? (
            <span className="mt-2 flex gap-2">
              <input
                className={`${FELD} font-normal`}
                value={neuerStandort}
                maxLength={100}
                placeholder={t("standort_neu_name")}
                aria-label={t("standort_neu_name")}
                onChange={(e) => setNeuerStandort(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    standortHinzufuegen();
                  }
                }}
              />
              <button
                type="button"
                onClick={standortHinzufuegen}
                disabled={!neuerStandort.trim() || standortAnlegen.isPending}
                className="rounded-cid px-3 py-2 text-sm font-medium text-text-secondary hover:bg-bg-secondary disabled:opacity-50"
              >
                {t("standort_neu_anlegen")}
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setNeuOffen(true)}
              className="mt-1 block text-xs font-medium text-text-secondary underline hover:text-text-primary"
            >
              {t("standort_neu")}
            </button>
          )}
        </div>
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
      <label className="flex items-center gap-2 text-xs font-medium text-text-secondary">
        <input
          type="checkbox"
          checked={ticketAktiv}
          onChange={(e) => setTicketAktiv(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-text-tertiary/40"
        />
        {t("v_ticket_aktiv")}
      </label>
      <p className="-mt-2 text-[11px] text-text-tertiary">{t("v_ticket_aide")}</p>
      <div className="text-xs font-semibold text-text-tertiary">
        <span className="mb-1 block">{t("v_beschreibung")}</span>
        <RichTextEditor
          value={beschreibung}
          onChange={setBeschreibung}
          ariaLabel={t("v_beschreibung")}
        />
      </div>
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
