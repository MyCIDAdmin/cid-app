/**
 * Page membre "Projets & Actions" (module ajouté le 2026-09-22, demande utilisateur — voir
 * apps.projets.models docstring de module pour les 8 points). Grille de kacheln (ProjetCard,
 * point 5 : retournement pour voir les contributeurs), modale de contribution libre (points 2/3)
 * qui crée une Cotisation en attente puis navigue vers `/cotisation?paiement=<id>` — même
 * pattern que ModaleInscription/onPayer dans EvenementsPage.tsx, voir sa docstring — et modale de
 * rapport d'avancement (point 7, RapportModal). La gestion complète du Projet lui-même (créer/
 * modifier/statut/cagnote/échéance/responsable) est réservée à /admin/projets (Bureau Admin+,
 * tâche séparée) : ici, `onModifier` n'est volontairement PAS branché sur ProjetCard, cette page
 * cible l'usage membre. Pour la même raison, `RapportModal` est utilisée en lecture seule ici
 * (`autoriserAjout={false}`, voir sa docstring) : ajouter une mise à jour de rapport reste une
 * action de gestion, réservée à /admin/projets, même pour un Bureau Admin+ qui consulterait cette
 * page-ci.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import ProjetCard from "../../components/projets/ProjetCard";
import RapportModal from "../../components/projets/RapportModal";
import { useContribuerProjet } from "../../hooks/useCotisations";
import { useProjets } from "../../hooks/useProjets";
import { extractApiErrorMessage } from "../../utils/apiError";
import type { ModePaiement } from "../../types/cotisation";
import type { Projet } from "../../types/projets";

const MODES_PROPOSES: ModePaiement[] = ["virement_sepa", "paypal"];

function ModaleContribution({
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
      <div className="w-full max-w-sm rounded-cid-lg bg-bg-primary p-4 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-text-primary">
            {t("modal_contribution.titre", { titre: projet.titre })}
          </h2>
          <button
            type="button"
            onClick={onClose}
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

export default function ProjetsPage() {
  const { t } = useTranslation("projets");
  const navigate = useNavigate();
  const projetsQuery = useProjets();
  const [projetContribution, setProjetContribution] = useState<Projet | null>(null);
  const [projetRapport, setProjetRapport] = useState<Projet | null>(null);

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-text-primary">{t("page.titre")}</h1>

      {projetsQuery.isLoading && (
        <p className="text-sm text-text-tertiary">{t("page.chargement")}</p>
      )}
      {projetsQuery.isError && (
        <p className="text-sm text-status-dangerText">{t("page.erreur_chargement")}</p>
      )}
      {projetsQuery.data?.results.length === 0 && (
        <p className="text-sm text-text-tertiary">{t("page.aucun_projet")}</p>
      )}

      {/* Kacheln empilées les unes sous les autres (demande utilisateur 2026-09-22) — plus de
          grille multi-colonnes : chaque ProjetCard a désormais une hauteur dynamique (basée sur
          le contenu, plus de hauteur fixe), une seule colonne évite que la hauteur d'une kachel
          avec une longue description "tire" ses voisines de la même ligne.
          max-w-2xl (ajouté le 2026-09-22, suite retour utilisateur) : la toute première version
          allait jusqu'à la pleine largeur de page (edge-to-edge), mais une kachel aussi large
          avec le carrousel d'images en hauteur fixe (h-40) forçait un recadrage/agrandissement
          beaucoup trop agressif des images (floues, coupées) — voir aussi le passage à
          object-contain dans ImageCarousel. Cette largeur plafonnée reste nettement plus large
          que l'ancienne grille à 3 colonnes tout en gardant les images lisibles. */}
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        {projetsQuery.data?.results.map((projet) => (
          <ProjetCard
            key={projet.id}
            projet={projet}
            onContribuer={setProjetContribution}
            onVoirRapport={setProjetRapport}
          />
        ))}
      </div>

      {projetContribution && (
        <ModaleContribution
          projet={projetContribution}
          onClose={() => setProjetContribution(null)}
          onPayer={(cotisationId) => navigate(`/cotisation?paiement=${cotisationId}`)}
        />
      )}

      {projetRapport && (
        <RapportModal
          projet={projetRapport}
          onClose={() => setProjetRapport(null)}
          // Page membre : consultation du rapport uniquement, jamais d'ajout de mise à jour ici
          // même pour un Bureau Admin+ (retour utilisateur 2026-09-22) — voir docstring
          // RapportModal.
          autoriserAjout={false}
        />
      )}
    </div>
  );
}
