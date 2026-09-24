/**
 * Gestion des paliers de réduction par quantité d'un produit (demande utilisateur du
 * 2026-09-23 : "Beim Kauf von über 10 Artikeln... 10% Rabatt" / "Beim Kauf von 5 Stück...
 * geschenkten Artikel") — panneau dépliable de GestionCatalogueTab, même principe que
 * VariantesManager.
 *
 * Générique côté modèle (voir apps.boutique.models.RegleReduction) : n'importe quel seuil de
 * quantité peut déclencher soit un pourcentage de réduction sur toute la ligne, soit un ou
 * plusieurs articles offerts (division entière quantité/seuil) — les deux exemples de la
 * demande utilisateur ne sont que des réglages possibles de ce système, pas des cas câblés en
 * dur. Deux règles peuvent coexister à des seuils différents pour un même type ; seule celle au
 * seuil le plus élevé ATTEINT s'applique (voir calculer_reduction_quantite côté backend).
 *
 * Lecture seule (task #216, 2026-09-24) : `modifiable` (optionnel, défaut `true`, voir
 * GestionCatalogueTab) désactive l'ajout/activation/suppression des règles.
 */
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  useCreerRegleReduction,
  useModifierRegleReduction,
  useReglesReduction,
  useSupprimerRegleReduction,
} from "../../hooks/useBoutique";
import type { Produit, TypeReduction } from "../../types/boutique";
import { extractApiErrorMessage } from "../../utils/apiError";

const TYPES_REDUCTION: TypeReduction[] = ["article_offert", "pourcentage"];

export default function RegleReductionManager({
  produit,
  modifiable = true,
}: {
  produit: Produit;
  modifiable?: boolean;
}) {
  const { t } = useTranslation(["boutique", "common"]);
  const reglesQuery = useReglesReduction({ produit: produit.id });
  const creerMutation = useCreerRegleReduction();
  const modifierMutation = useModifierRegleReduction();
  const supprimerMutation = useSupprimerRegleReduction();

  const [seuil, setSeuil] = useState(5);
  const [typeReduction, setTypeReduction] = useState<TypeReduction>("article_offert");
  const [pourcentage, setPourcentage] = useState(10);

  function handleAjouter(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    creerMutation.mutate(
      {
        produit: produit.id,
        seuil_quantite: seuil,
        type_reduction: typeReduction,
        pourcentage: typeReduction === "pourcentage" ? pourcentage : null,
      },
      {
        onSuccess: () => {
          setSeuil(5);
          setTypeReduction("article_offert");
          setPourcentage(10);
        },
      },
    );
  }

  const regles = reglesQuery.data?.results ?? produit.regles_reduction_actives;

  return (
    <div className="mt-2 rounded-cid border border-text-tertiary/20 bg-bg-tertiary/40 p-3">
      <h3 className="mb-2 text-xs font-bold text-text-primary">
        {t("catalogue_admin.regles_reduction_titre")}
      </h3>
      <div className="space-y-1.5">
        {regles.map((r) => (
          <div key={r.id} className="flex items-center gap-2 text-xs">
            <span className="flex-1">
              {r.type_reduction === "pourcentage"
                ? t("catalogue.regle_pourcentage", { seuil: r.seuil_quantite, pct: r.pourcentage })
                : t("catalogue.regle_article_offert", { seuil: r.seuil_quantite })}
            </span>
            <label className="flex items-center gap-1 text-[10px] text-text-secondary">
              <input
                type="checkbox"
                checked={r.actif}
                aria-label={t("catalogue_admin.regle_active_label")}
                onChange={(e) => modifierMutation.mutate({ id: r.id, payload: { actif: e.target.checked } })}
                disabled={!modifiable}
                title={!modifiable ? t("common:acces.lecture_seule_tooltip") ?? "" : ""}
              />
              {t("catalogue_admin.regle_active_label")}
            </label>
            <button
              type="button"
              onClick={() => supprimerMutation.mutate(r.id)}
              disabled={!modifiable}
              title={!modifiable ? t("common:acces.lecture_seule_tooltip") ?? "" : ""}
              className="text-text-tertiary hover:text-status-dangerText disabled:opacity-40"
              aria-label={t("catalogue_admin.supprimer_regle")}
            >
              ✕
            </button>
          </div>
        ))}
        {regles.length === 0 && (
          <p className="text-xs text-text-tertiary">{t("catalogue_admin.aucune_regle")}</p>
        )}
      </div>

      {creerMutation.isError && (
        <p className="mt-1.5 text-[11px] text-status-dangerText">
          {extractApiErrorMessage(creerMutation.error, t("catalogue_admin.regle_erreur"))}
        </p>
      )}

      <form onSubmit={handleAjouter} className="mt-2 flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor={`seuil-${produit.id}`} className="block text-[10px] text-text-tertiary">
            {t("catalogue_admin.seuil_quantite_label")}
          </label>
          <input
            id={`seuil-${produit.id}`}
            type="number"
            min={1}
            value={seuil}
            onChange={(e) => setSeuil(Number(e.target.value))}
            className="w-16 rounded-cid border border-text-tertiary/30 px-1.5 py-1 text-xs"
          />
        </div>
        <div>
          <label htmlFor={`type-${produit.id}`} className="block text-[10px] text-text-tertiary">
            {t("catalogue_admin.type_reduction_label")}
          </label>
          <select
            id={`type-${produit.id}`}
            value={typeReduction}
            onChange={(e) => setTypeReduction(e.target.value as TypeReduction)}
            className="rounded-cid border border-text-tertiary/30 px-1.5 py-1 text-xs"
          >
            {TYPES_REDUCTION.map((type) => (
              <option key={type} value={type}>
                {t(`type_reduction.${type}`)}
              </option>
            ))}
          </select>
        </div>
        {typeReduction === "pourcentage" && (
          <div>
            <label
              htmlFor={`pourcentage-${produit.id}`}
              className="block text-[10px] text-text-tertiary"
            >
              {t("catalogue_admin.rabais_label")}
            </label>
            <input
              id={`pourcentage-${produit.id}`}
              type="number"
              min={1}
              max={90}
              value={pourcentage}
              onChange={(e) => setPourcentage(Number(e.target.value))}
              className="w-16 rounded-cid border border-text-tertiary/30 px-1.5 py-1 text-xs"
            />
          </div>
        )}
        <button
          type="submit"
          disabled={creerMutation.isPending || !modifiable}
          title={!modifiable ? t("common:acces.lecture_seule_tooltip") ?? "" : ""}
          className="rounded-cid bg-ca px-2.5 py-1 text-xs font-medium text-white hover:bg-cad disabled:opacity-40"
        >
          {t("catalogue_admin.ajouter_regle")}
        </button>
      </form>
    </div>
  );
}
