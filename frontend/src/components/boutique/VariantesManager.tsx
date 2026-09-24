/**
 * Gestion des variantes (taille/couleur/stock) d'un produit — panneau dépliable de
 * GestionCatalogueTab (mockup #m-edit-prod, FDD §3.4 "stock par variante").
 *
 * Lecture seule (task #216, 2026-09-24) : `modifiable` (optionnel, défaut `true`, voir
 * GestionCatalogueTab) désactive l'ajout/modification/suppression de variantes.
 */
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  useCreerVariante,
  useModifierVariante,
  useSupprimerVariante,
  useVariantes,
} from "../../hooks/useBoutique";
import type { Produit } from "../../types/boutique";

export default function VariantesManager({
  produit,
  modifiable = true,
}: {
  produit: Produit;
  modifiable?: boolean;
}) {
  const { t } = useTranslation(["boutique", "common"]);
  const variantesQuery = useVariantes(produit.id);
  const creerMutation = useCreerVariante();
  const modifierMutation = useModifierVariante();
  const supprimerMutation = useSupprimerVariante();

  const [taille, setTaille] = useState("");
  const [couleur, setCouleur] = useState("");
  const [stock, setStock] = useState(0);

  function handleAjouter(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    creerMutation.mutate(
      { produit: produit.id, taille, couleur, stock },
      {
        onSuccess: () => {
          setTaille("");
          setCouleur("");
          setStock(0);
        },
      },
    );
  }

  const variantes = variantesQuery.data?.results ?? produit.variantes;

  return (
    <div className="mt-2 rounded-cid border border-text-tertiary/20 bg-bg-tertiary/40 p-3">
      <h3 className="mb-2 text-xs font-bold text-text-primary">
        {t("catalogue_admin.variantes_titre")}
      </h3>
      <div className="space-y-1.5">
        {variantes.map((v) => (
          <div key={v.id} className="flex items-center gap-2 text-xs">
            <span className="flex-1">
              {[v.taille, v.couleur].filter(Boolean).join(" / ") ||
                t("catalogue_admin.variante_unique")}
            </span>
            <input
              type="number"
              min={0}
              aria-label={t("catalogue_admin.stock_label")}
              value={v.stock}
              onChange={(e) => {
                // Garde de défense en profondeur — voir GestionCatalogueTab.toggleStatut pour
                // le raisonnement (onChange, pas un <button disabled>).
                if (!modifiable) return;
                modifierMutation.mutate({
                  id: v.id,
                  produitId: produit.id,
                  payload: { stock: Number(e.target.value) },
                });
              }}
              disabled={!modifiable}
              title={!modifiable ? t("common:acces.lecture_seule_tooltip") ?? "" : ""}
              className="w-16 rounded-cid border border-text-tertiary/30 px-1.5 py-0.5 text-right disabled:opacity-40"
            />
            <button
              type="button"
              onClick={() => supprimerMutation.mutate({ id: v.id, produitId: produit.id })}
              disabled={!modifiable}
              title={!modifiable ? t("common:acces.lecture_seule_tooltip") ?? "" : ""}
              className="text-text-tertiary hover:text-status-dangerText disabled:opacity-40"
              aria-label={t("catalogue_admin.supprimer_variante")}
            >
              ✕
            </button>
          </div>
        ))}
        {variantes.length === 0 && (
          <p className="text-xs text-text-tertiary">{t("catalogue_admin.aucune_variante")}</p>
        )}
      </div>

      <form onSubmit={handleAjouter} className="mt-2 flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor={`taille-${produit.id}`} className="block text-[10px] text-text-tertiary">
            {t("catalogue_admin.taille_label")}
          </label>
          <input
            id={`taille-${produit.id}`}
            value={taille}
            onChange={(e) => setTaille(e.target.value)}
            className="w-20 rounded-cid border border-text-tertiary/30 px-1.5 py-1 text-xs"
          />
        </div>
        <div>
          <label htmlFor={`couleur-${produit.id}`} className="block text-[10px] text-text-tertiary">
            {t("catalogue_admin.couleur_label")}
          </label>
          <input
            id={`couleur-${produit.id}`}
            value={couleur}
            onChange={(e) => setCouleur(e.target.value)}
            className="w-24 rounded-cid border border-text-tertiary/30 px-1.5 py-1 text-xs"
          />
        </div>
        <div>
          <label htmlFor={`stock-${produit.id}`} className="block text-[10px] text-text-tertiary">
            {t("catalogue_admin.stock_label")}
          </label>
          <input
            id={`stock-${produit.id}`}
            type="number"
            min={0}
            value={stock}
            onChange={(e) => setStock(Number(e.target.value))}
            className="w-16 rounded-cid border border-text-tertiary/30 px-1.5 py-1 text-xs"
          />
        </div>
        <button
          type="submit"
          disabled={creerMutation.isPending || !modifiable}
          title={!modifiable ? t("common:acces.lecture_seule_tooltip") ?? "" : ""}
          className="rounded-cid bg-ca px-2.5 py-1 text-xs font-medium text-white hover:bg-cad disabled:opacity-40"
        >
          {t("catalogue_admin.ajouter_variante")}
        </button>
      </form>
    </div>
  );
}
