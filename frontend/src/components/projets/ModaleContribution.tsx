/**
 * Modale de contribution libre (demande utilisateur points 2/3) — extraite de ProjetsPage.tsx le
 * 2026-09-26 (demande utilisateur : porter la structure de https://www.mycid.org/projects sur
 * /projets) pour être réutilisable aussi bien depuis la grille de kacheln (ProjetsPage) que depuis
 * la nouvelle page de détail (ProjetDetailPage, équivalent du bouton "Donate Now"/"View Project"
 * de mycid.org). Crée une Cotisation en attente puis navigue vers `/cotisation?paiement=<id>` —
 * même pattern que ModaleInscription/onPayer dans EvenementsPage.tsx, voir sa docstring.
 */
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { useContribuerProjet } from "../../hooks/useCotisations";
import { useEscapeSchliessen } from "../../hooks/useEscapeSchliessen";
import { extractApiErrorMessage } from "../../utils/apiError";
import type { ModePaiement } from "../../types/cotisation";
import type { Projet } from "../../types/projets";

const MODES_PROPOSES: ModePaiement[] = ["virement_sepa", "paypal"];

export default function ModaleContribution({
  projet,
  onClose,
  onPayer,
}: {
  projet: Projet;
  onClose: () => void;
  onPayer: (cotisationId: string) => void;
}) {
  const { t } = useTranslation(["projets", "cotisations", "common"]);
  const contribuer = useContribuerProjet();
  const titreId = useId();
  useEscapeSchliessen(onClose);
  const [montant, setMontant] = useState("");
  const [modePaiement, setModePaiement] = useState<ModePaiement>("virement_sepa");
  const [libelle, setLibelle] = useState("");
  const [erreur, setErreur] = useState("");

  function confirmer() {
    setErreur("");
    contribuer.mutate(
      { type_article: "projet", projet: projet.id, montant, mode_paiement: modePaiement, libelle },
      {
        onSuccess: (cotisation) => {
          onClose();
          onPayer(cotisation.id);
        },
        onError: (err) => setErreur(extractApiErrorMessage(err, t("modal_contribution.erreur"))),
      },
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titreId}
        className="w-full max-w-sm rounded-cid-lg bg-bg-primary p-4 shadow-lg"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id={titreId} className="text-base font-bold text-text-primary">
            {t("modal_contribution.titre", { titre: projet.titre })}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common:action.fermer")}
            className="text-text-tertiary hover:text-text-primary"
          >
            ×
          </button>
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-text-secondary">
            {t("modal_contribution.montant")}
          </label>
          <div className="flex items-center rounded-cid border border-text-tertiary/30 px-2">
            <input
              type="number"
              min="1"
              step="0.01"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              className="w-full border-none py-1.5 text-sm focus:outline-none"
            />
            <span className="text-sm text-text-tertiary">€</span>
          </div>
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-text-secondary">
            {t("modal_contribution.mode_paiement")}
          </label>
          <div className="space-y-1.5">
            {MODES_PROPOSES.map((mode) => (
              <label
                key={mode}
                className={`flex cursor-pointer items-center gap-2 rounded-cid border px-2.5 py-1.5 text-sm ${
                  modePaiement === mode ? "border-ca bg-cal/20" : "border-text-tertiary/20"
                }`}
              >
                <input
                  type="radio"
                  name="mode_paiement"
                  checked={modePaiement === mode}
                  onChange={() => setModePaiement(mode)}
                />
                {t(`cotisations:paiement.${mode === "virement_sepa" ? "sepa" : "paypal"}_titre`)}
              </label>
            ))}
          </div>
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-text-secondary">
            {t("modal_contribution.libelle")}
          </label>
          <input
            type="text"
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            placeholder={t("modal_contribution.libelle_placeholder") ?? ""}
            className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          />
        </div>

        {erreur && <p className="mb-2 text-xs text-status-dangerText">{erreur}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-cid px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-secondary"
          >
            {t("common:action.annuler")}
          </button>
          <button
            type="button"
            onClick={confirmer}
            disabled={contribuer.isPending || !montant}
            className="rounded-cid bg-ca px-4 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
          >
            {t("modal_contribution.confirmer")}
          </button>
        </div>
      </div>
    </div>
  );
}
