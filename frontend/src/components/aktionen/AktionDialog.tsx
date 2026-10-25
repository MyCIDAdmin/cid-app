/**
 * Dialog zum Anlegen und Bearbeiten einer Beitragsaktion (Beitragsartikel mit Beschreibung,
 * Dringend-Markierung, Frist, Zielbetrag, öffentlicher Seite und Erinnerungen).
 */
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import RichTextEditor from "../ui/RichTextEditor";
import { hintergrundKlick, useEscapeSchliessen } from "../../hooks/useEscapeSchliessen";
import { useCreerArticleCatalogue, useModifierArticleCatalogue } from "../../hooks/useCotisations";
import type { ArticleCatalogue, ArticleCataloguePayload } from "../../types/cotisation";
import { heuteIso } from "../../utils/aktionen";
import { extractApiErrorMessage } from "../../utils/apiError";

interface Props {
  /** Vorhandene Aktion bearbeiten; ohne Angabe wird eine neue angelegt. */
  article?: ArticleCatalogue;
  onClose: () => void;
}

const FELD = "w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm";
const LABEL = "mb-1 block text-xs font-semibold uppercase text-text-tertiary";

export default function AktionDialog({ article, onClose }: Props) {
  const { t } = useTranslation(["cotisations", "common"]);
  const titelId = useId();
  const creer = useCreerArticleCatalogue();
  const modifier = useModifierArticleCatalogue();
  useEscapeSchliessen(onClose);

  const [libelle, setLibelle] = useState(article?.libelle ?? "");
  const [montant, setMontant] = useState(article?.montant ?? "");
  const [beschreibung, setBeschreibung] = useState(article?.beschreibung ?? "");
  const [dringend, setDringend] = useState(article?.dringend ?? false);
  const [frist, setFrist] = useState(article?.frist ?? "");
  const [zielbetrag, setZielbetrag] = useState(article?.zielbetrag ?? "");
  const [oeffentlich, setOeffentlich] = useState(article?.oeffentlich ?? false);
  const [erinnerungen, setErinnerungen] = useState(article?.erinnerungen ?? false);
  const [betragErhoehbar, setBetragErhoehbar] = useState(article?.betrag_erhoehbar ?? false);
  const [fehler, setFehler] = useState<string | null>(null);

  const laeuft = creer.isPending || modifier.isPending;

  function speichern(e: React.FormEvent) {
    e.preventDefault();
    setFehler(null);
    if (erinnerungen && !frist && !zielbetrag) {
      setFehler(t("aktion.dialog.fehler_erinnerung_ohne_ziel"));
      return;
    }
    const payload: ArticleCataloguePayload = {
      libelle,
      montant,
      beschreibung,
      dringend,
      frist: frist || null,
      zielbetrag: zielbetrag || null,
      oeffentlich,
      erinnerungen,
      betrag_erhoehbar: betragErhoehbar,
    };
    const optionen = {
      onSuccess: onClose,
      onError: (err: unknown) =>
        setFehler(extractApiErrorMessage(err, t("catalogue_articles.erreur_action"))),
    };
    if (article) modifier.mutate({ id: article.id, payload }, optionen);
    else creer.mutate(payload, optionen);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
      {...hintergrundKlick(onClose)}
    >
      <form
        onSubmit={speichern}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titelId}
        className="my-4 w-full max-w-2xl rounded-cid-lg bg-bg-primary p-5 shadow-lg"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titelId} className="text-base font-bold text-text-primary">
            {article ? t("aktion.dialog.titel_bearbeiten") : t("aktion.dialog.titel_neu")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common:action.fermer")}
            className="text-xl leading-none text-text-tertiary hover:text-text-primary"
          >
            ×
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
          <div>
            <label htmlFor="aktion-libelle" className={LABEL}>
              {t("catalogue_articles.champ_libelle")}
            </label>
            <input
              id="aktion-libelle"
              type="text"
              value={libelle}
              onChange={(e) => setLibelle(e.target.value)}
              className={FELD}
              required
            />
          </div>
          <div>
            <label htmlFor="aktion-montant" className={LABEL}>
              {betragErhoehbar
                ? t("aktion.dialog.mindestbetrag")
                : t("catalogue_articles.champ_montant")}
            </label>
            <input
              id="aktion-montant"
              type="number"
              step="0.01"
              min="0.01"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              className={FELD}
              required
            />
          </div>
        </div>

        <div className="mt-3">
          <span className={LABEL}>{t("aktion.dialog.beschreibung")}</span>
          <RichTextEditor
            value={beschreibung}
            onChange={setBeschreibung}
            placeholder={t("aktion.dialog.beschreibung_platzhalter")}
            ariaLabel={t("aktion.dialog.beschreibung")}
          />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="aktion-frist" className={LABEL}>
              {t("aktion.dialog.frist")}
            </label>
            <input
              id="aktion-frist"
              type="date"
              value={frist}
              min={article?.frist ? undefined : heuteIso()}
              onChange={(e) => setFrist(e.target.value)}
              className={FELD}
            />
          </div>
          <div>
            <label htmlFor="aktion-ziel" className={LABEL}>
              {t("aktion.dialog.zielbetrag")}
            </label>
            <input
              id="aktion-ziel"
              type="number"
              step="0.01"
              min="0.01"
              value={zielbetrag}
              onChange={(e) => setZielbetrag(e.target.value)}
              className={FELD}
            />
            <p className="mt-1 text-[11px] text-text-tertiary">
              {t("aktion.dialog.zielbetrag_hinweis")}
            </p>
          </div>
        </div>

        <fieldset className="mt-4 space-y-2">
          {(
            [
              ["betrag_erhoehbar", betragErhoehbar, setBetragErhoehbar],
              ["dringend", dringend, setDringend],
              ["oeffentlich", oeffentlich, setOeffentlich],
              ["erinnerungen", erinnerungen, setErinnerungen],
            ] as const
          ).map(([schluessel, wert, setzen]) => (
            <label key={schluessel} className="flex items-start gap-2 text-sm text-text-primary">
              <input
                type="checkbox"
                checked={wert}
                onChange={(e) => setzen(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">{t(`aktion.dialog.${schluessel}`)}</span>
                <span className="block text-xs text-text-tertiary">
                  {t(`aktion.dialog.${schluessel}_hinweis`)}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        {fehler && <p className="mt-3 text-xs text-status-dangerText">{fehler}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary"
          >
            {t("common:action.annuler")}
          </button>
          <button
            type="submit"
            disabled={laeuft}
            className="rounded-cid bg-ca px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            {laeuft ? t("catalogue_articles.en_cours") : t("catalogue_articles.enregistrer")}
          </button>
        </div>
      </form>
    </div>
  );
}
