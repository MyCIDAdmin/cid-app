/**
 * Formular „Hilfe gesucht“: einmalige Hilfe (mit Datum) oder dauerhafte Aufgabe, optionale Frist,
 * Sichtbarkeit (nur Mitglieder oder öffentlich ohne Anmeldung), optional Sektor und Fähigkeit.
 */
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { useFaehigkeitenKatalog } from "../../hooks/useFaehigkeiten";
import { useRegionen } from "../../hooks/useRegionen";
import { useStelleErstellen } from "../../hooks/useProjets";
import type { ArtStelle, SichtbarkeitStelle } from "../../types/projets";
import { extractApiErrorMessage } from "../../utils/apiError";
import { useFaehigkeitLabel } from "../../utils/faehigkeitLabel";

const FELD = "w-full rounded-cid border border-text-tertiary/30 bg-bg-primary px-2 py-1.5 text-sm";
const LABEL = "block text-xs font-medium text-text-secondary";

export default function GesuchForm({ onFertig }: { onFertig: () => void }) {
  const { t } = useTranslation("projets");
  const faehigkeitLabel = useFaehigkeitLabel();
  const katalog = useFaehigkeitenKatalog();
  const regionen = useRegionen();
  const erstellen = useStelleErstellen();
  const [titel, setTitel] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [art, setArt] = useState<ArtStelle>("einmalig");
  const [termin, setTermin] = useState("");
  const [ort, setOrt] = useState("");
  const [frist, setFrist] = useState("");
  const [sichtbarkeit, setSichtbarkeit] = useState<SichtbarkeitStelle>("mitglieder");
  const [region, setRegion] = useState("");
  const [faehigkeit, setFaehigkeit] = useState("");
  const [anzahl, setAnzahl] = useState(1);
  const [fehler, setFehler] = useState("");

  function senden(e: FormEvent) {
    e.preventDefault();
    if (!titel.trim()) return;
    if (art === "einmalig" && !termin) {
      setFehler(t("hilfe.form.termin_noetig"));
      return;
    }
    setFehler("");
    erstellen.mutate(
      {
        titel: titel.trim(),
        beschreibung: beschreibung.trim(),
        art,
        termin: art === "einmalig" ? termin : null,
        ort: ort.trim(),
        frist: frist || null,
        sichtbarkeit,
        region: region || null,
        faehigkeit: faehigkeit || null,
        anzahl,
      },
      {
        onSuccess: onFertig,
        onError: (err) => setFehler(extractApiErrorMessage(err, t("stellen.fehler"))),
      },
    );
  }

  return (
    <form
      onSubmit={senden}
      className="space-y-3 rounded-cid-lg bg-bg-primary p-4 shadow-sm"
      aria-label={t("hilfe.form.titel")}
    >
      <h2 className="text-base font-bold text-text-primary">{t("hilfe.form.titel")}</h2>

      <div>
        <label className={LABEL} htmlFor="hg-titel">
          {t("stellen.titel_label")}
        </label>
        <input
          id="hg-titel"
          value={titel}
          onChange={(e) => setTitel(e.target.value)}
          maxLength={120}
          placeholder={t("hilfe.form.titel_platzhalter")}
          className={FELD}
        />
      </div>

      <fieldset className="space-y-1">
        <legend className={LABEL}>{t("hilfe.form.art")}</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          {(["einmalig", "dauerhaft"] as const).map((wert) => (
            <label key={wert} className="flex items-center gap-1.5">
              <input
                type="radio"
                name="hg-art"
                checked={art === wert}
                onChange={() => setArt(wert)}
              />
              {t(`hilfe.art.${wert}`)}
            </label>
          ))}
        </div>
        <p className="text-xs text-text-tertiary">{t(`hilfe.form.art_hinweis_${art}`)}</p>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        {art === "einmalig" && (
          <div>
            <label className={LABEL} htmlFor="hg-termin">
              {t("hilfe.form.termin")}
            </label>
            <input
              id="hg-termin"
              type="date"
              value={termin}
              onChange={(e) => setTermin(e.target.value)}
              className={FELD}
            />
          </div>
        )}
        <div>
          <label className={LABEL} htmlFor="hg-ort">
            {t("hilfe.form.ort")}
          </label>
          <input
            id="hg-ort"
            value={ort}
            onChange={(e) => setOrt(e.target.value)}
            maxLength={120}
            className={FELD}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="hg-frist">
            {t("hilfe.form.frist")}
          </label>
          <input
            id="hg-frist"
            type="date"
            value={frist}
            onChange={(e) => setFrist(e.target.value)}
            className={FELD}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="hg-anzahl">
            {t("stellen.anzahl_label")}
          </label>
          <input
            id="hg-anzahl"
            type="number"
            min={1}
            max={50}
            value={anzahl}
            onChange={(e) => setAnzahl(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
            className={FELD}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="hg-faehigkeit">
            {t("stellen.faehigkeit_label")}
          </label>
          <select
            id="hg-faehigkeit"
            value={faehigkeit}
            onChange={(e) => setFaehigkeit(e.target.value)}
            className={FELD}
          >
            <option value="">{t("stellen.ohne_faehigkeit")}</option>
            {(katalog.data ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {faehigkeitLabel(f.bezeichnung)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="hg-region">
            {t("hilfe.form.region")}
          </label>
          <select
            id="hg-region"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className={FELD}
          >
            <option value="">{t("hilfe.form.ohne_region")}</option>
            {(regionen.data?.ergebnisse ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={LABEL} htmlFor="hg-beschreibung">
          {t("stellen.beschreibung_label")}
        </label>
        <textarea
          id="hg-beschreibung"
          value={beschreibung}
          onChange={(e) => setBeschreibung(e.target.value)}
          maxLength={1000}
          rows={4}
          placeholder={t("stellen.beschreibung_platzhalter")}
          className={FELD}
        />
      </div>

      <fieldset className="space-y-1">
        <legend className={LABEL}>{t("hilfe.form.sichtbarkeit")}</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          {(["mitglieder", "oeffentlich"] as const).map((wert) => (
            <label key={wert} className="flex items-center gap-1.5">
              <input
                type="radio"
                name="hg-sichtbarkeit"
                checked={sichtbarkeit === wert}
                onChange={() => setSichtbarkeit(wert)}
              />
              {t(`hilfe.sichtbarkeit.${wert}`)}
            </label>
          ))}
        </div>
        <p className="text-xs text-text-tertiary">{t("hilfe.form.sichtbarkeit_hinweis")}</p>
      </fieldset>

      {fehler && (
        <p role="alert" className="text-sm text-status-dangerText">
          {fehler}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={erstellen.isPending || !titel.trim()}
          className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-50"
        >
          {t("hilfe.form.veroeffentlichen")}
        </button>
        <button
          type="button"
          onClick={onFertig}
          className="rounded-cid px-3 py-1.5 text-sm text-text-secondary"
        >
          {t("stellen.abbrechen")}
        </button>
      </div>
    </form>
  );
}
