/**
 * Onglet "Catalogue" de la page Admin — Boutique (mockup #pg-admin-boutique, tab-pane
 * btq-catalog) : création/édition de produits, panneau variantes dépliable par produit.
 *
 * Volontairement sans gestion d'image (Produit.image, upload MinIO) dans cette itération —
 * ajouter un upload multipart cohérent avec le reste du formulaire (validation MIME côté
 * backend, CLAUDE.md §8) mérite son propre ticket plutôt qu'un champ fichier ajouté à la hâte
 * ici ; les produits sans image affichent un pictogramme de substitution (voir CataloguePage).
 */
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { useCreerProduit, useModifierProduit, useProduits } from "../../hooks/useBoutique";
import type {
  CategorieProduit,
  Produit,
  ProduitPayload,
  StatutProduit,
} from "../../types/boutique";
import { extractApiErrorMessage } from "../../utils/apiError";
import VariantesManager from "./VariantesManager";

const CATEGORIES: CategorieProduit[] = [
  "vetements",
  "accessoires",
  "articles_club",
  "cartes_docs",
  "divers",
];
const STATUTS: StatutProduit[] = ["brouillon", "publie", "archive"];

const STATUT_STYLES: Record<StatutProduit, string> = {
  brouillon: "bg-bg-tertiary text-text-secondary",
  publie: "bg-status-successBg text-status-successText",
  archive: "bg-status-dangerBg text-status-dangerText",
};

function formulaireInitial(): ProduitPayload {
  return {
    nom: "",
    categorie: "vetements",
    description: "",
    prix: "0.00",
    statut: "brouillon",
    nouveaute: false,
    seuil_alerte_stock: 5,
  };
}

export default function GestionCatalogueTab() {
  const { t } = useTranslation("boutique");
  const produitsQuery = useProduits();
  const creerMutation = useCreerProduit();
  const modifierMutation = useModifierProduit();

  const [form, setForm] = useState<ProduitPayload>(formulaireInitial);
  const [produitDeplie, setProduitDeplie] = useState<string | null>(null);

  function handleCreer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    creerMutation.mutate(form, { onSuccess: () => setForm(formulaireInitial()) });
  }

  function toggleStatut(produit: Produit, statut: StatutProduit) {
    modifierMutation.mutate({ id: produit.id, payload: { statut } });
  }

  return (
    <div>
      <div className="mb-5 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <h2 className="mb-3 text-xs font-bold text-text-primary">
          {t("catalogue_admin.nouveau_produit")}
        </h2>
        <form onSubmit={handleCreer} className="grid gap-3 md:grid-cols-2">
          <div>
            <label
              htmlFor="prod-nom"
              className="mb-1 block text-xs font-medium text-text-secondary"
            >
              {t("catalogue_admin.nom_label")}
            </label>
            <input
              id="prod-nom"
              required
              value={form.nom}
              onChange={(e) => setForm({ ...form, nom: e.target.value })}
              className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="prod-categorie"
              className="mb-1 block text-xs font-medium text-text-secondary"
            >
              {t("catalogue_admin.categorie_label")}
            </label>
            <select
              id="prod-categorie"
              value={form.categorie}
              onChange={(e) => setForm({ ...form, categorie: e.target.value as CategorieProduit })}
              className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {t(`categorie.${cat}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="prod-prix"
              className="mb-1 block text-xs font-medium text-text-secondary"
            >
              {t("catalogue_admin.prix_label")}
            </label>
            <input
              id="prod-prix"
              type="number"
              min="0"
              step="0.01"
              required
              value={form.prix}
              onChange={(e) => setForm({ ...form, prix: e.target.value })}
              className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="prod-seuil"
              className="mb-1 block text-xs font-medium text-text-secondary"
            >
              {t("catalogue_admin.seuil_label")}
            </label>
            <input
              id="prod-seuil"
              type="number"
              min="0"
              value={form.seuil_alerte_stock}
              onChange={(e) => setForm({ ...form, seuil_alerte_stock: Number(e.target.value) })}
              className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label
              htmlFor="prod-desc"
              className="mb-1 block text-xs font-medium text-text-secondary"
            >
              {t("catalogue_admin.description_label")}
            </label>
            <textarea
              id="prod-desc"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={form.nouveaute}
              onChange={(e) => setForm({ ...form, nouveaute: e.target.checked })}
            />
            {t("catalogue_admin.nouveaute_label")}
          </label>

          {creerMutation.isError && (
            <p className="text-xs text-status-dangerText md:col-span-2">
              {extractApiErrorMessage(creerMutation.error, t("catalogue_admin.erreur_creation"))}
            </p>
          )}
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={creerMutation.isPending}
              className="rounded-cid bg-ca px-4 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-40"
            >
              {t("catalogue_admin.creer")}
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <h2 className="mb-3 text-xs font-bold text-text-primary">
          {t("catalogue_admin.produits_titre")}
        </h2>
        {produitsQuery.isLoading && (
          <p className="text-sm text-text-tertiary">{t("catalogue.chargement")}</p>
        )}
        {produitsQuery.data && produitsQuery.data.results.length === 0 && (
          <p className="text-sm text-text-tertiary">{t("catalogue_admin.aucun_produit")}</p>
        )}
        <div className="space-y-2">
          {produitsQuery.data?.results.map((produit) => (
            <div key={produit.id} className="rounded-cid border border-text-tertiary/20 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex-1 text-sm font-semibold text-text-primary">
                  {produit.nom}
                </span>
                <span className="text-xs text-text-tertiary">
                  {t(`categorie.${produit.categorie}`)}
                </span>
                <span className="text-sm font-bold text-ca">
                  {Number(produit.prix).toFixed(2).replace(".", ",")} €
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUT_STYLES[produit.statut]}`}
                >
                  {t(`statut_produit.${produit.statut}`)}
                </span>
                {produit.stock_faible && !produit.en_rupture && (
                  <span className="text-[10px] font-medium text-status-warningText">
                    ⚠ {t("catalogue_admin.stock_faible")}
                  </span>
                )}
                {produit.en_rupture && (
                  <span className="text-[10px] font-medium text-status-dangerText">
                    {t("catalogue.rupture")}
                  </span>
                )}
                <select
                  aria-label={t("catalogue_admin.changer_statut")}
                  value={produit.statut}
                  onChange={(e) => toggleStatut(produit, e.target.value as StatutProduit)}
                  className="rounded-cid border border-text-tertiary/30 px-1.5 py-1 text-xs"
                >
                  {STATUTS.map((s) => (
                    <option key={s} value={s}>
                      {t(`statut_produit.${s}`)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    setProduitDeplie((cur) => (cur === produit.id ? null : produit.id))
                  }
                  className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs text-text-secondary hover:bg-bg-tertiary"
                >
                  {produitDeplie === produit.id
                    ? t("catalogue_admin.masquer_variantes")
                    : t("catalogue_admin.gerer_variantes")}
                </button>
              </div>
              {produitDeplie === produit.id && <VariantesManager produit={produit} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
