/**
 * Onglet "Catalogue" de la page Admin — Boutique (mockup #pg-admin-boutique, tab-pane
 * btq-catalog) : création/édition de produits, panneau variantes dépliable par produit.
 *
 * Stock initial : un champ "Stock initial" à la création crée automatiquement, côté backend,
 * une VarianteProduit "unique" (taille/couleur vides, voir ProduitSerializer.stock_initial) —
 * évite d'avoir à ouvrir le panneau "gérer les variantes" juste après création pour les
 * produits sans déclinaison réelle. La gestion fine (plusieurs tailles/couleurs) reste dans
 * VariantesManager, inchangée.
 *
 * Rabais : `pourcentage_reduction` (1-90 %) est éditable en création et en modification
 * inline ; l'affichage du prix soldé (`prix_final`) se fait dans CataloguePage/CataloguePage
 * côté membre, jamais recalculé ici (CLAUDE.md §8 — le backend reste seul juge du prix final).
 *
 * Image produit : upload multipart (validation MIME côté backend, CLAUDE.md §8) une fois le
 * produit créé — voir useTeleverserImageProduit / storage.py (MinIO). Les produits sans image
 * continuent d'afficher un pictogramme de substitution (voir CataloguePage).
 *
 * Lecture seule (task #216, 2026-09-24) : `modifiable` (optionnel, défaut `true` pour les tests
 * existants qui rendent ce composant seul) vient de la matrice "page_boutique" via
 * AdminBoutiquePage/usePageAccess — désactive la création/modification de produits (statut,
 * rabais, image) et se propage à VariantesManager/RegleReductionManager, dont le CRUD fait
 * partie de la même gestion catalogue.
 */
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  useCreerProduit,
  useModifierProduit,
  useSupprimerProduit,
  useProduits,
  useTeleverserImageProduit,
} from "../../hooks/useBoutique";
import type {
  CategorieProduit,
  Produit,
  ProduitPayload,
  StatutProduit,
  TypeProduit,
} from "../../types/boutique";
import { extractApiErrorMessage } from "../../utils/apiError";
import BildHinweis from "../ui/BildHinweis";
import GalerieProduitManager from "./GalerieProduitManager";
import RegleReductionManager from "./RegleReductionManager";
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
    pourcentage_reduction: null,
    prix_membre: null,
    statut: "brouillon",
    type_produit: "physique",
    nouveaute: false,
    seuil_alerte_stock: 5,
    stock_initial: 0,
  };
}

export default function GestionCatalogueTab({ modifiable = true }: { modifiable?: boolean } = {}) {
  const { t } = useTranslation(["boutique", "common"]);
  const produitsQuery = useProduits();
  const creerMutation = useCreerProduit();
  const modifierMutation = useModifierProduit();
  const supprimerMutation = useSupprimerProduit();
  const [produitASupprimer, setProduitASupprimer] = useState<string | null>(null);
  const [suppressionErreur, setSuppressionErreur] = useState<{
    produitId: string;
    message: string;
  } | null>(null);
  const televerserImageMutation = useTeleverserImageProduit();

  const [form, setForm] = useState<ProduitPayload>(formulaireInitial);
  const [produitDeplie, setProduitDeplie] = useState<string | null>(null);
  const [produitReductionDeplie, setProduitReductionDeplie] = useState<string | null>(null);
  const [produitGalerieDeplie, setProduitGalerieDeplie] = useState<string | null>(null);
  const [produitImageEnCours, setProduitImageEnCours] = useState<string | null>(null);
  const [produitImageErreur, setProduitImageErreur] = useState<{
    produitId: string;
    message: string;
  } | null>(null);
  const inputsFichierImage = useRef<Record<string, HTMLInputElement | null>>({});

  function handleCreer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // stock_initial n'a aucun sens pour un "bon_achat" (pas de stock réel, voir champ masqué
    // ci-dessous) et ne doit jamais être envoyé pour ce type : le backend a sa propre garde
    // (ProduitSerializer.create ignore stock_initial pour BON_ACHAT depuis le correctif du
    // 2026-09-23 — bug réel constaté en production, IntegrityError sur la contrainte d'unicité
    // de VarianteProduit car ce champ restait à sa valeur par défaut 0 même masqué côté UI) mais
    // on ne s'y fie pas seul (CLAUDE.md §8, même principe que partout ailleurs dans ce fichier).
    const payload: ProduitPayload =
      form.type_produit === "bon_achat" ? { ...form, stock_initial: undefined } : form;
    creerMutation.mutate(payload, { onSuccess: () => setForm(formulaireInitial()) });
  }

  /**
   * Bascule type "physique"/"bon_achat" (demande utilisateur du 2026-09-23, "Gutschein wird ein
   * echtes Produkt im Katalog") — categorie="bon_achat" est imposée avec le type (voir
   * CataloguePage/TypeProduit ci-dessus : les deux vont toujours ensemble dans cette UI, même si
   * le backend ne les couple pas structurellement), et reste bloquée sur "vetements" par défaut
   * si l'admin repasse en "physique" après avoir choisi "bon_achat" — une catégorie "Bons
   * d'achat" n'aurait aucun sens pour un produit physique.
   */
  function handleChangerType(type: TypeProduit) {
    setForm((f) => ({
      ...f,
      type_produit: type,
      categorie:
        type === "bon_achat"
          ? "bon_achat"
          : f.categorie === "bon_achat"
            ? "vetements"
            : f.categorie,
    }));
  }

  // Garde de défense en profondeur (2026-09-24, retour utilisateur task #216) : le `disabled`
  // sur les contrôles correspondants bloque déjà l'interaction utilisateur normale, mais ces
  // handlers sont déclenchés par onChange (select/input file), pas par un <button disabled> —
  // rien n'empêche donc un appel programmatique de les invoquer quand même. Le backend reste la
  // seule source de vérité (rejette de toute façon en 403), ce garde évite un appel inutile.
  function toggleStatut(produit: Produit, statut: StatutProduit) {
    if (!modifiable) return;
    modifierMutation.mutate({ id: produit.id, payload: { statut } });
  }

  function modifierRabais(produit: Produit, valeur: string) {
    if (!modifiable) return;
    const pourcentage = valeur === "" ? null : Number(valeur);
    modifierMutation.mutate({ id: produit.id, payload: { pourcentage_reduction: pourcentage } });
  }

  function modifierPrixMembre(produit: Produit, valeur: string) {
    if (!modifiable) return;
    modifierMutation.mutate({
      id: produit.id,
      payload: { prix_membre: valeur === "" ? null : valeur },
    });
  }

  function handleImageChoisie(produit: Produit, e: ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    e.target.value = "";
    if (!fichier || !modifiable) return;
    setProduitImageEnCours(produit.id);
    setProduitImageErreur(null);
    televerserImageMutation.mutate(
      { id: produit.id, fichier },
      {
        onError: (err) =>
          setProduitImageErreur({
            produitId: produit.id,
            message: extractApiErrorMessage(err, t("catalogue_admin.image_erreur")),
          }),
        onSettled: () => setProduitImageEnCours(null),
      },
    );
  }

  return (
    <div>
      <BildHinweis variante="shop" className="mb-3" />
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
              htmlFor="prod-type"
              className="mb-1 block text-xs font-medium text-text-secondary"
            >
              {t("catalogue_admin.type_label")}
            </label>
            <select
              id="prod-type"
              value={form.type_produit ?? "physique"}
              onChange={(e) => handleChangerType(e.target.value as TypeProduit)}
              className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            >
              <option value="physique">{t("catalogue_admin.type_physique")}</option>
              <option value="bon_achat">{t("catalogue_admin.type_bon_achat")}</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="prod-categorie"
              className="mb-1 block text-xs font-medium text-text-secondary"
            >
              {t("catalogue_admin.categorie_label")}
            </label>
            {form.type_produit === "bon_achat" ? (
              // Imposée avec le type "bon_achat" (voir handleChangerType) — pas de choix
              // pertinent à proposer ici, un produit "bon_achat" est toujours de cette catégorie.
              <input
                id="prod-categorie"
                disabled
                value={t("categorie.bon_achat")}
                className="w-full rounded-cid border border-text-tertiary/30 bg-bg-tertiary px-2 py-1.5 text-sm text-text-tertiary"
              />
            ) : (
              <select
                id="prod-categorie"
                value={form.categorie}
                onChange={(e) =>
                  setForm({ ...form, categorie: e.target.value as CategorieProduit })
                }
                className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {t(`categorie.${cat}`)}
                  </option>
                ))}
              </select>
            )}
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
          {/* Stock, alerte et rabais n'ont pas de sens pour un "bon_achat" (montant choisi par
              l'acheteur, jamais de stock/rabais catalogue — voir TypeProduit) — masqués plutôt
              que désactivés, pour ne pas laisser croire qu'ils s'appliqueraient quand même. */}
          {form.type_produit !== "bon_achat" && (
            <>
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
              <div>
                <label
                  htmlFor="prod-stock-initial"
                  className="mb-1 block text-xs font-medium text-text-secondary"
                >
                  {t("catalogue_admin.stock_initial_label")}
                </label>
                <input
                  id="prod-stock-initial"
                  type="number"
                  min="0"
                  value={form.stock_initial ?? 0}
                  onChange={(e) => setForm({ ...form, stock_initial: Number(e.target.value) })}
                  className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label
                  htmlFor="prod-rabais"
                  className="mb-1 block text-xs font-medium text-text-secondary"
                >
                  {t("catalogue_admin.rabais_label")}
                </label>
                <input
                  id="prod-rabais"
                  type="number"
                  min="1"
                  max="90"
                  placeholder={t("catalogue_admin.rabais_placeholder")}
                  value={form.pourcentage_reduction ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      pourcentage_reduction: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label
                  htmlFor="prod-prix-membre"
                  className="mb-1 block text-xs font-medium text-text-secondary"
                >
                  {t("catalogue_admin.prix_membre_label")}
                </label>
                <input
                  id="prod-prix-membre"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={t("catalogue_admin.prix_membre_placeholder")}
                  value={form.prix_membre ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      prix_membre: e.target.value === "" ? null : e.target.value,
                    })
                  }
                  className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
                />
              </div>
            </>
          )}
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
              disabled={creerMutation.isPending || !modifiable}
              title={!modifiable ? (t("common:acces.lecture_seule_tooltip") ?? "") : ""}
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
                {produit.image ? (
                  <img src={produit.image} alt="" className="h-10 w-10 rounded-cid object-cover" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-cid bg-bg-tertiary text-text-tertiary">
                    🛍️
                  </div>
                )}
                <span className="flex-1 text-sm font-semibold text-text-primary">
                  {produit.nom}
                </span>
                <span className="text-xs text-text-tertiary">
                  {t(`categorie.${produit.categorie}`)}
                </span>
                {produit.pourcentage_reduction ? (
                  <span className="text-right text-xs">
                    <span className="mr-1 text-text-tertiary line-through">
                      {Number(produit.prix).toFixed(2).replace(".", ",")} €
                    </span>
                    <span className="font-bold text-status-dangerText">
                      {Number(produit.prix_final).toFixed(2).replace(".", ",")} €
                    </span>
                  </span>
                ) : (
                  <span className="text-sm font-bold text-ca">
                    {Number(produit.prix).toFixed(2).replace(".", ",")} €
                  </span>
                )}
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
                <label className="flex items-center gap-1 text-[10px] text-text-secondary">
                  {t("catalogue_admin.rabais_label")}
                  <input
                    type="number"
                    min="1"
                    max="90"
                    aria-label={`${t("catalogue_admin.rabais_label")} — ${produit.nom}`}
                    defaultValue={produit.pourcentage_reduction ?? ""}
                    onBlur={(e) => modifierRabais(produit, e.target.value)}
                    disabled={!modifiable}
                    title={!modifiable ? (t("common:acces.lecture_seule_tooltip") ?? "") : ""}
                    className="w-14 rounded-cid border border-text-tertiary/30 px-1 py-0.5 text-xs disabled:opacity-40"
                  />
                </label>
                {produit.type_produit !== "bon_achat" && (
                  <label className="flex items-center gap-1 text-[10px] text-text-secondary">
                    {t("catalogue_admin.prix_membre_label")}
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder={t("catalogue_admin.prix_membre_placeholder")}
                      aria-label={`${t("catalogue_admin.prix_membre_label")} — ${produit.nom}`}
                      defaultValue={produit.prix_membre ?? ""}
                      onBlur={(e) => modifierPrixMembre(produit, e.target.value)}
                      disabled={!modifiable}
                      title={!modifiable ? (t("common:acces.lecture_seule_tooltip") ?? "") : ""}
                      className="w-16 rounded-cid border border-text-tertiary/30 px-1 py-0.5 text-xs disabled:opacity-40"
                    />
                  </label>
                )}
                <select
                  aria-label={t("catalogue_admin.changer_statut")}
                  value={produit.statut}
                  onChange={(e) => toggleStatut(produit, e.target.value as StatutProduit)}
                  disabled={!modifiable}
                  title={!modifiable ? (t("common:acces.lecture_seule_tooltip") ?? "") : ""}
                  className="rounded-cid border border-text-tertiary/30 px-1.5 py-1 text-xs disabled:opacity-40"
                >
                  {STATUTS.map((s) => (
                    <option key={s} value={s}>
                      {t(`statut_produit.${s}`)}
                    </option>
                  ))}
                </select>
                <input
                  type="file"
                  accept="image/*"
                  ref={(el) => {
                    inputsFichierImage.current[produit.id] = el;
                  }}
                  onChange={(e) => handleImageChoisie(produit, e)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => inputsFichierImage.current[produit.id]?.click()}
                  disabled={produitImageEnCours === produit.id || !modifiable}
                  title={!modifiable ? (t("common:acces.lecture_seule_tooltip") ?? "") : ""}
                  className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs text-text-secondary hover:bg-bg-tertiary disabled:opacity-40"
                >
                  {produitImageEnCours === produit.id
                    ? t("catalogue_admin.image_en_cours")
                    : t("catalogue_admin.image_televerser")}
                </button>
                {/* Retour utilisateur (2026-09-24, task #216) : même principe que le bouton
                    "gérer les offres" de AdminCampagnesPage — dépli/repli d'affichage, pas une
                    action d'écriture, mais le libellé en lecture seule doit refléter qu'aucune
                    modification n'est possible derrière. */}
                <button
                  type="button"
                  onClick={() =>
                    setProduitDeplie((cur) => (cur === produit.id ? null : produit.id))
                  }
                  className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs text-text-secondary hover:bg-bg-tertiary"
                >
                  {produitDeplie === produit.id
                    ? t("catalogue_admin.masquer_variantes")
                    : modifiable
                      ? t("catalogue_admin.gerer_variantes")
                      : t("catalogue_admin.voir_variantes")}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setProduitReductionDeplie((cur) => (cur === produit.id ? null : produit.id))
                  }
                  className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs text-text-secondary hover:bg-bg-tertiary"
                >
                  {produitReductionDeplie === produit.id
                    ? t("catalogue_admin.masquer_regles_reduction")
                    : modifiable
                      ? t("catalogue_admin.gerer_regles_reduction")
                      : t("catalogue_admin.voir_regles_reduction")}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setProduitGalerieDeplie((cur) => (cur === produit.id ? null : produit.id))
                  }
                  className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs text-text-secondary hover:bg-bg-tertiary"
                >
                  {produitGalerieDeplie === produit.id
                    ? t("catalogue_admin.masquer_galerie")
                    : modifiable
                      ? t("catalogue_admin.gerer_galerie")
                      : t("catalogue_admin.voir_galerie")}
                </button>
                {modifiable &&
                  (produitASupprimer === produit.id ? (
                    <span className="flex items-center gap-1 text-xs">
                      <span className="text-status-dangerText">
                        {t("catalogue_admin.supprimer_confirmer")}
                      </span>
                      <button
                        type="button"
                        disabled={supprimerMutation.isPending}
                        onClick={() =>
                          supprimerMutation.mutate(produit.id, {
                            onSuccess: () => {
                              setProduitASupprimer(null);
                              setSuppressionErreur(null);
                            },
                            onError: (err) => {
                              setProduitASupprimer(null);
                              setSuppressionErreur({
                                produitId: produit.id,
                                message: extractApiErrorMessage(
                                  err,
                                  t("catalogue_admin.supprimer_erreur"),
                                ),
                              });
                            },
                          })
                        }
                        className="rounded-cid bg-status-dangerText px-2 py-1 text-white disabled:opacity-50"
                      >
                        {t("catalogue_admin.supprimer_oui")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setProduitASupprimer(null)}
                        className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-text-secondary hover:bg-bg-tertiary"
                      >
                        {t("catalogue_admin.supprimer_non")}
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setProduitASupprimer(produit.id)}
                      className="rounded-cid border border-status-dangerText/40 px-2 py-1 text-xs text-status-dangerText hover:bg-status-dangerBg"
                    >
                      {t("catalogue_admin.supprimer_produit")}
                    </button>
                  ))}
              </div>
              {suppressionErreur?.produitId === produit.id && (
                <p className="mt-1 text-[11px] text-status-dangerText">
                  {suppressionErreur.message}
                </p>
              )}
              {produitImageErreur?.produitId === produit.id && (
                <p className="mt-1 text-[11px] text-status-dangerText">
                  {produitImageErreur.message}
                </p>
              )}
              {produitDeplie === produit.id && (
                <VariantesManager produit={produit} modifiable={modifiable} />
              )}
              {produitReductionDeplie === produit.id && (
                <RegleReductionManager produit={produit} modifiable={modifiable} />
              )}
              {produitGalerieDeplie === produit.id && (
                <GalerieProduitManager produit={produit} modifiable={modifiable} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
