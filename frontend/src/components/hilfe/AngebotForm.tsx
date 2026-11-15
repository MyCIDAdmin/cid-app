/**
 * Offene Meldung: Ein Mitglied bietet von sich aus Hilfe an („Ich helfe gern bei …“), auch wenn es
 * kein passendes Gesuch gibt. Das Büro sieht das Angebot und meldet sich.
 */
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import RichTextEditor from "../ui/RichTextEditor";
import { useHilfeAngebotErstellen, useHilfeKategorien } from "../../hooks/useProjets";
import { extractApiErrorMessage } from "../../utils/apiError";
import { kategorieName } from "../../utils/hilfe";

const FELD = "w-full rounded-cid border border-text-tertiary/30 bg-bg-primary px-2 py-1.5 text-sm";
const LABEL = "block text-xs font-medium text-text-secondary";

export default function AngebotForm({ onFertig }: { onFertig: () => void }) {
  const { t, i18n } = useTranslation("projets");
  const kategorien = useHilfeKategorien();
  const erstellen = useHilfeAngebotErstellen();
  const [titel, setTitel] = useState("");
  const [kategorie, setKategorie] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [verfuegbarkeit, setVerfuegbarkeit] = useState("");
  const [fehler, setFehler] = useState("");

  function senden(e: FormEvent) {
    e.preventDefault();
    if (!titel.trim()) return;
    setFehler("");
    erstellen.mutate(
      {
        titel: titel.trim(),
        kategorie: kategorie || null,
        beschreibung,
        verfuegbarkeit: verfuegbarkeit.trim(),
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
      aria-label={t("hilfe.angebot.formular")}
    >
      <h2 className="text-base font-bold text-text-primary">{t("hilfe.angebot.formular")}</h2>
      <p className="text-xs text-text-secondary">{t("hilfe.angebot.einleitung")}</p>

      <div>
        <label className={LABEL} htmlFor="ha-titel">
          {t("hilfe.angebot.thema")}
        </label>
        <input
          id="ha-titel"
          value={titel}
          onChange={(e) => setTitel(e.target.value)}
          maxLength={120}
          placeholder={t("hilfe.angebot.thema_platzhalter")}
          className={FELD}
        />
      </div>

      <div>
        <label className={LABEL} htmlFor="ha-kategorie">
          {t("hilfe.form.kategorie")}
        </label>
        <select
          id="ha-kategorie"
          value={kategorie}
          onChange={(e) => setKategorie(e.target.value)}
          className={FELD}
        >
          <option value="">{t("hilfe.form.ohne_kategorie")}</option>
          {(kategorien.data ?? []).map((k) => (
            <option key={k.id} value={k.id}>
              {kategorieName(k, i18n.language)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <span className={LABEL}>{t("hilfe.angebot.beschreibung")}</span>
        <RichTextEditor
          value={beschreibung}
          onChange={setBeschreibung}
          placeholder={t("hilfe.angebot.beschreibung_platzhalter")}
          ariaLabel={t("hilfe.angebot.beschreibung")}
        />
      </div>

      <div>
        <label className={LABEL} htmlFor="ha-verfuegbar">
          {t("hilfe.angebot.verfuegbarkeit")}
        </label>
        <input
          id="ha-verfuegbar"
          value={verfuegbarkeit}
          onChange={(e) => setVerfuegbarkeit(e.target.value)}
          maxLength={200}
          placeholder={t("hilfe.angebot.verfuegbarkeit_platzhalter")}
          className={FELD}
        />
      </div>

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
          {t("hilfe.angebot.senden")}
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
