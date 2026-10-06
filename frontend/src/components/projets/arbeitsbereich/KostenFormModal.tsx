import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useKostenAendern, useKostenErfassen } from "../../../hooks/useProjets";
import type { Aufgabe, KostenartAuswahl, KostenPosition } from "../../../types/projets";
import { extractApiErrorMessage } from "../../../utils/apiError";
import { kategorieName } from "../../../utils/kategorie";

const CHAMP = "w-full rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm";
const LABEL = "mb-1 block text-[10px] uppercase text-text-tertiary";

/** Erfassung/Korrektur einer Ist-Position (2026-10-06). Beleg PDF/JPG/PNG als multipart ; eine
 * abgelehnte Position, die korrigiert wird, geht serverseitig automatisch wieder in die Freigabe. */
export default function KostenFormModal({
  projetId,
  position,
  kostenarten,
  aufgaben,
  onClose,
}: {
  projetId: string;
  position: KostenPosition | null;
  kostenarten: KostenartAuswahl[];
  aufgaben: Aufgabe[];
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation("projets");
  const erfassen = useKostenErfassen();
  const aendern = useKostenAendern();
  const [datum, setDatum] = useState(
    position?.date_depense ?? new Date().toISOString().slice(0, 10),
  );
  const [montant, setMontant] = useState(position?.montant ?? "");
  const [kostenart, setKostenart] = useState(position?.categorie ?? "");
  const [lieferant, setLieferant] = useState(position?.fournisseur ?? "");
  const [beschreibung, setBeschreibung] = useState(position?.description ?? "");
  const [aufgabe, setAufgabe] = useState(position?.aufgabe ?? "");
  const [beleg, setBeleg] = useState<File | null>(null);
  const [erreur, setErreur] = useState("");

  async function senden(e: React.FormEvent) {
    e.preventDefault();
    setErreur("");
    const felder = {
      date_depense: datum,
      montant,
      categorie: kostenart,
      fournisseur: lieferant,
      description: beschreibung,
      aufgabe: aufgabe || null,
      ...(beleg ? { justificatif: beleg } : {}),
    };
    try {
      if (position) await aendern.mutateAsync({ id: position.id, payload: felder });
      else await erfassen.mutateAsync({ projet: projetId, ...felder });
      onClose();
    } catch (error) {
      setErreur(extractApiErrorMessage(error, t("arbeitsbereich.fehler")));
    }
  }

  const titel = position
    ? t("arbeitsbereich.kosten.form.bearbeiten")
    : t("arbeitsbereich.kosten.form.neu");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titel}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <form
        onSubmit={senden}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-cid-lg bg-bg-primary p-5 shadow-xl"
      >
        <h2 className="mb-1 text-base font-semibold text-text-primary">{titel}</h2>
        <p className="mb-3 text-xs text-text-tertiary">{t("arbeitsbereich.kosten.form.hinweis")}</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="kst-datum" className={LABEL}>
              {t("arbeitsbereich.kosten.form.datum")}
            </label>
            <input
              id="kst-datum"
              type="date"
              required
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
              className={CHAMP}
            />
          </div>
          <div>
            <label htmlFor="kst-betrag" className={LABEL}>
              {t("arbeitsbereich.kosten.form.betrag")}
            </label>
            <input
              id="kst-betrag"
              type="number"
              min="0.01"
              step="0.01"
              required
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              className={CHAMP}
            />
          </div>
          <div className="col-span-2">
            <label htmlFor="kst-lieferant" className={LABEL}>
              {t("arbeitsbereich.kosten.form.lieferant")}
            </label>
            <input
              id="kst-lieferant"
              required
              value={lieferant}
              onChange={(e) => setLieferant(e.target.value)}
              className={CHAMP}
            />
          </div>
          <div>
            <label htmlFor="kst-art" className={LABEL}>
              {t("arbeitsbereich.kosten.form.kostenart")}
            </label>
            <select
              id="kst-art"
              required
              value={kostenart}
              onChange={(e) => setKostenart(e.target.value)}
              className={CHAMP}
            >
              <option value="" />
              {kostenarten.map((k) => (
                <option key={k.id} value={k.id}>
                  {kategorieName(k.namen, k.nom, i18n.language)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="kst-aufgabe" className={LABEL}>
              {t("arbeitsbereich.kosten.form.aufgabe")}
            </label>
            <select
              id="kst-aufgabe"
              value={aufgabe}
              onChange={(e) => setAufgabe(e.target.value)}
              className={CHAMP}
            >
              <option value="">{t("arbeitsbereich.kosten.form.keine_aufgabe")}</option>
              {aufgaben.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.titel}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label htmlFor="kst-beschreibung" className={LABEL}>
              {t("arbeitsbereich.kosten.form.beschreibung")}
            </label>
            <textarea
              id="kst-beschreibung"
              rows={2}
              value={beschreibung}
              onChange={(e) => setBeschreibung(e.target.value)}
              className={CHAMP}
            />
          </div>
          <div className="col-span-2">
            <label htmlFor="kst-beleg" className={LABEL}>
              {t("arbeitsbereich.kosten.form.beleg")}
            </label>
            <input
              id="kst-beleg"
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              onChange={(e) => setBeleg(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
          </div>
        </div>
        {erreur && <p className="mt-3 text-xs text-status-dangerText">{erreur}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary"
          >
            {t("arbeitsbereich.kosten.form.abbrechen")}
          </button>
          <button
            type="submit"
            disabled={erfassen.isPending || aendern.isPending}
            className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {t("arbeitsbereich.kosten.form.speichern")}
          </button>
        </div>
      </form>
    </div>
  );
}
