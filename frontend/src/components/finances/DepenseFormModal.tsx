import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useEvenements } from "../../hooks/useEvenements";
import { useCategories, useCreerDepense, useModifierDepense } from "../../hooks/useFinances";
import { useProjets } from "../../hooks/useProjets";
import type { Depense } from "../../types/finances";
import { extractApiErrorMessage } from "../../utils/apiError";
import { kategorieName } from "../../utils/kategorie";

const CHAMP = "w-full rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm";
const LABEL = "mb-1 block text-[10px] uppercase text-text-tertiary";

/** Création/modification d'une dépense (justificatif PDF/JPG/PNG en multipart). Une dépense
 * rejetée corrigée repart automatiquement en validation côté serveur. */
export default function DepenseFormModal({
  depense,
  onClose,
}: {
  depense: Depense | null;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation("finances");
  const categories = useCategories();
  const evenements = useEvenements();
  const projets = useProjets();
  const creer = useCreerDepense();
  const modifier = useModifierDepense();

  const [date, setDate] = useState(depense?.date_depense ?? new Date().toISOString().slice(0, 10));
  const [montant, setMontant] = useState(depense?.montant ?? "");
  const [categorie, setCategorie] = useState(depense?.categorie ?? "");
  const [fournisseur, setFournisseur] = useState(depense?.fournisseur ?? "");
  const [description, setDescription] = useState(depense?.description ?? "");
  const [evenement, setEvenement] = useState(depense?.evenement ?? "");
  const [projet, setProjet] = useState(depense?.projet ?? "");
  const [fichier, setFichier] = useState<File | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    const payload = {
      date_depense: date,
      montant,
      categorie,
      fournisseur,
      description,
      evenement: evenement || null,
      projet: projet || null,
      ...(fichier ? { justificatif: fichier } : {}),
    };
    try {
      if (depense) await modifier.mutateAsync({ id: depense.id, payload });
      else await creer.mutateAsync(payload);
      onClose();
    } catch (error) {
      setErreur(extractApiErrorMessage(error, t("erreur")));
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={depense ? t("modifier") : t("nouvelle_depense")}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <form
        onSubmit={envoyer}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-cid-lg bg-bg-primary p-5 shadow-xl"
      >
        <h2 className="mb-4 text-base font-semibold text-text-primary">
          {depense ? t("modifier") : t("nouvelle_depense")}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="dep-date" className={LABEL}>
              {t("champ.date")}
            </label>
            <input
              id="dep-date"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={CHAMP}
            />
          </div>
          <div>
            <label htmlFor="dep-montant" className={LABEL}>
              {t("champ.montant")}
            </label>
            <input
              id="dep-montant"
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
            <label htmlFor="dep-fournisseur" className={LABEL}>
              {t("champ.fournisseur")}
            </label>
            <input
              id="dep-fournisseur"
              required
              value={fournisseur}
              onChange={(e) => setFournisseur(e.target.value)}
              className={CHAMP}
            />
          </div>
          <div className="col-span-2">
            <label htmlFor="dep-categorie" className={LABEL}>
              {t("champ.categorie")}
            </label>
            <select
              id="dep-categorie"
              required
              value={categorie}
              onChange={(e) => setCategorie(e.target.value)}
              className={CHAMP}
            >
              <option value="" />
              {categories.data
                ?.filter((c) => c.actif || c.id === depense?.categorie)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {kategorieName(c.namen, c.nom, i18n.language)}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label htmlFor="dep-evenement" className={LABEL}>
              {t("champ.evenement")}
            </label>
            <select
              id="dep-evenement"
              value={evenement}
              onChange={(e) => setEvenement(e.target.value)}
              className={CHAMP}
            >
              <option value="">{t("champ.aucun")}</option>
              {evenements.data?.results.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.titre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="dep-projet" className={LABEL}>
              {t("champ.projet")}
            </label>
            <select
              id="dep-projet"
              value={projet}
              onChange={(e) => setProjet(e.target.value)}
              className={CHAMP}
            >
              <option value="">{t("champ.aucun")}</option>
              {projets.data?.results.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.titre}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label htmlFor="dep-description" className={LABEL}>
              {t("champ.description")}
            </label>
            <textarea
              id="dep-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={CHAMP}
            />
          </div>
          <div className="col-span-2">
            <label htmlFor="dep-justificatif" className={LABEL}>
              {t("champ.justificatif")}
            </label>
            <input
              id="dep-justificatif"
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              onChange={(e) => setFichier(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
          </div>
        </div>
        {erreur && <p className="mt-3 text-xs text-status-dangerText">{erreur}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary"
          >
            {t("annuler")}
          </button>
          <button
            type="submit"
            disabled={creer.isPending || modifier.isPending}
            className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {t("enregistrer")}
          </button>
        </div>
      </form>
    </div>
  );
}
