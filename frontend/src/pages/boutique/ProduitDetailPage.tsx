/**
 * Page de détail d'un produit (demande utilisateur 2026-09-26 : "https://my-cid.de/boutique soll
 * die gleich funktionalitäten beibehalten aber die Struktur und verhaten von
 * https://www.mycid.org/shop übernehmen" — le clic sur une kachel du catalogue mycid.org/shop
 * ouvre une page dédiée par produit, voir https://www.mycid.org/shop/03ca1917-2582-4dd5-95bf-
 * 7878f070067c, même principe que ProjetDetailPage pour /projets le même jour). Route
 * `/boutique/:id` (voir App.tsx) — le panier, les variantes taille/couleur et les paliers de
 * réduction quantité restent EXACTEMENT les mêmes qu'avant (voir CataloguePage/panierStore),
 * cette page réutilise d'ailleurs StepperQuantite/formatMontant/labelVariante/
 * labelRegleReduction déjà définis là-bas plutôt que de les dupliquer.
 *
 * Prix membre/non-membre (demande utilisateur, "Preise für Mitglieder und nicht Mitglieder zu
 * definieren" — exemple donné : https://www.mycid.org/shop/03ca1917-2582-4dd5-95bf-7878f070067c) :
 * `produit.prix_affiche`/`produit.est_prix_membre` sont déjà résolus côté serveur
 * (ProduitSerializer.get_prix_affiche, à partir du statut du membre connecté) — cette page les
 * affiche tels quels, jamais recalculés ici (CLAUDE.md §8).
 *
 * Le produit "bon_achat" (montant libre plutôt que variante) reste géré depuis la kachel du
 * catalogue (voir ProduitCarteBonAchat) — sa page de détail se limite à un lien de retour, cette
 * page ne duplique pas le sélecteur de montant.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import ShareButton from "../../components/ui/ShareButton";
import { useProduit } from "../../hooks/useBoutique";
import { usePanierStore } from "../../store/panierStore";
import {
  StepperQuantite,
  formatMontant,
  labelRegleReduction,
  labelVariante,
} from "./CataloguePage";

export default function ProduitDetailPage() {
  const { t } = useTranslation("boutique");
  const { id } = useParams<{ id: string }>();
  const produitQuery = useProduit(id);
  const produit = produitQuery.data;
  const ajouter = usePanierStore((s) => s.ajouter);

  const variantesEnStock = produit?.variantes.filter((v) => v.stock > 0) ?? [];
  const [varianteId, setVarianteId] = useState<string>("");
  const [quantite, setQuantite] = useState(1);

  // Galerie de photos supplémentaires (demande utilisateur du 2026-09-27, point 13.1 : "die
  // Bilder können User sich im Shop anschauen") — `produit.image` (kachel/historique) reste la
  // première vignette pour ne rien changer visuellement quand aucune photo supplémentaire
  // n'a été ajoutée ; sélection par miniatures plutôt qu'un carrousel auto-rotatif (voir
  // ImageCarousel côté projets) : sur une fiche produit consultée activement, l'utilisateur
  // choisit lui-même la photo qu'il veut voir, contrairement à une kachel de catalogue survolée
  // passivement.
  const [indexGalerieActif, setIndexGalerieActif] = useState(0);
  useEffect(() => {
    setIndexGalerieActif(0);
  }, [produit?.id]);
  const imagesGalerie = produit
    ? [
        ...(produit.image ? [{ id: "principale", image: produit.image }] : []),
        ...produit.images,
      ]
    : [];
  const imageAffichee = imagesGalerie[indexGalerieActif]?.image ?? produit?.image ?? null;

  const varianteSelectionnee = produit?.variantes.find(
    (v) => v.id === (varianteId || variantesEnStock[0]?.id),
  );
  const epuise = !varianteSelectionnee || varianteSelectionnee.stock <= 0;

  function handleChangerVariante(nouvelId: string) {
    setVarianteId(nouvelId);
    setQuantite(1);
  }

  function handleAjouter() {
    if (!produit || !varianteSelectionnee) return;
    ajouter(
      {
        varianteId: varianteSelectionnee.id,
        produitId: produit.id,
        nom: produit.nom,
        taille: varianteSelectionnee.taille,
        couleur: varianteSelectionnee.couleur,
        // prix_affiche (jamais prix/prix_final seuls) : déjà résolu côté serveur, voir docstring
        // ci-dessus — même principe que ProduitCarte (CataloguePage).
        prixUnitaire: produit.prix_affiche,
        stockDisponible: varianteSelectionnee.stock,
        typeProduit: "physique",
        reglesReduction: produit.regles_reduction_actives,
      },
      quantite,
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/boutique" className="mb-3 inline-block text-xs text-ca hover:underline">
        {t("detail.retour_catalogue")}
      </Link>

      {produitQuery.isLoading && (
        <p className="text-sm text-text-tertiary">{t("catalogue.chargement")}</p>
      )}
      {produitQuery.isError && (
        <p className="text-sm text-status-dangerText">{t("catalogue.erreur")}</p>
      )}

      {produit && (
        <div className="overflow-hidden rounded-cid-lg border border-text-tertiary/20 bg-card-gradient shadow-card sm:grid sm:grid-cols-2">
          <div className="relative flex h-64 items-center justify-center bg-cal sm:h-full">
            {produit.nouveaute && (
              <span className="absolute left-3 top-3 rounded px-1.5 py-0.5 text-[10px] font-bold text-white bg-ca">
                {t("catalogue.badge_nouveaute")}
              </span>
            )}
            {produit.est_prix_membre ? (
              <span className="absolute right-3 top-3 rounded-full bg-status-dangerText px-2 py-0.5 text-[10px] font-bold text-white shadow">
                👑 {t("catalogue.badge_prix_membre")}
              </span>
            ) : (
              produit.pourcentage_reduction && (
                <span className="absolute right-3 top-3 rounded px-1.5 py-0.5 text-[10px] font-bold text-white bg-status-dangerText">
                  {t("catalogue.badge_rabais", { pct: produit.pourcentage_reduction })}
                </span>
              )
            )}
            {epuise && produit.type_produit !== "bon_achat" && (
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/70 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
                {t("catalogue.rupture")}
              </span>
            )}
            <div className="absolute bottom-3 right-3 rounded-full bg-bg-primary/80 backdrop-blur-sm">
              <ShareButton path={`/boutique/${produit.id}`} titre={produit.nom} />
            </div>
            {imageAffichee ? (
              <img src={imageAffichee} alt={produit.nom} className="h-full w-full object-cover" />
            ) : (
              <span className="text-6xl">{produit.type_produit === "bon_achat" ? "🎁" : "🛍️"}</span>
            )}
            {imagesGalerie.length > 1 && (
              <div className="absolute inset-x-0 bottom-0 flex gap-1.5 overflow-x-auto bg-black/40 p-2">
                {imagesGalerie.map((img, i) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => setIndexGalerieActif(i)}
                    aria-label={t("detail.galerie_vignette", { n: i + 1 })}
                    className={`h-10 w-10 shrink-0 overflow-hidden rounded border-2 ${
                      i === indexGalerieActif
                        ? "border-white"
                        : "border-transparent opacity-70 hover:opacity-100"
                    }`}
                  >
                    <img src={img.image} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 p-4 sm:p-6">
            <span className="w-fit rounded-full bg-bg-tertiary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-tertiary">
              {t(`categorie.${produit.categorie}`)}
            </span>
            <h1 className="text-xl font-bold leading-snug text-text-primary">{produit.nom}</h1>

            {produit.est_prix_membre ? (
              <span className="flex flex-wrap items-baseline gap-2">
                <span className="text-2xl font-bold text-status-dangerText">
                  {formatMontant(produit.prix_affiche)}
                </span>
                <span className="text-sm text-text-tertiary line-through">
                  {formatMontant(produit.prix_final)}
                </span>
                <span className="rounded-full bg-status-successBg px-2 py-0.5 text-xs font-bold text-status-successText">
                  {t("catalogue.badge_prix_membre")}
                </span>
              </span>
            ) : produit.pourcentage_reduction ? (
              <span className="flex items-baseline gap-2">
                <span className="text-sm text-text-tertiary line-through">
                  {formatMontant(produit.prix)}
                </span>
                <span className="text-2xl font-bold text-status-dangerText">
                  {formatMontant(produit.prix_affiche)}
                </span>
              </span>
            ) : (
              <span className="text-2xl font-bold text-ca">
                {formatMontant(produit.prix_affiche)}
              </span>
            )}

            {produit.description && (
              <p className="text-sm text-text-secondary">{produit.description}</p>
            )}

            {produit.regles_reduction_actives.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {produit.regles_reduction_actives.map((regle) => (
                  <span
                    key={regle.id}
                    className="rounded-full bg-cal/30 px-1.5 py-0.5 text-[10px] font-medium text-cad"
                  >
                    🎁 {labelRegleReduction(regle, t)}
                  </span>
                ))}
              </div>
            )}

            {produit.type_produit === "bon_achat" ? (
              // Montant libre : géré uniquement depuis la kachel du catalogue (voir docstring) —
              // cette page se contente d'un renvoi clair plutôt que de dupliquer le sélecteur.
              <Link
                to="/boutique"
                className="mt-2 w-full rounded-cid bg-ca px-4 py-2 text-center text-sm font-medium text-white hover:bg-cad"
              >
                {t("detail.choisir_montant_catalogue")}
              </Link>
            ) : (
              <>
                <div className="text-xs text-text-tertiary">
                  {produit.en_rupture
                    ? t("catalogue.rupture")
                    : produit.stock_faible
                      ? t("catalogue.stock_faible", { stock: produit.stock_total })
                      : t("catalogue.en_stock", { stock: produit.stock_total })}
                </div>

                {produit.variantes.length > 1 && (
                  <select
                    aria-label={t("catalogue.variante_label")}
                    value={varianteSelectionnee?.id ?? ""}
                    onChange={(e) => handleChangerVariante(e.target.value)}
                    className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
                  >
                    {produit.variantes.map((v) => (
                      <option key={v.id} value={v.id} disabled={v.stock <= 0}>
                        {labelVariante(v)} {v.stock <= 0 ? `— ${t("catalogue.rupture")}` : ""}
                      </option>
                    ))}
                  </select>
                )}

                {!epuise && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-text-secondary">
                      {t("detail.quantite_label")}
                    </span>
                    <StepperQuantite
                      quantite={quantite}
                      max={varianteSelectionnee?.stock ?? 1}
                      onChange={setQuantite}
                      labelDiminuer={t("commande.diminuer")}
                      labelAugmenter={t("commande.augmenter")}
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleAjouter}
                  disabled={epuise}
                  className="mt-2 w-full rounded-cid bg-ca px-4 py-2.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-40"
                >
                  🛒 {epuise ? t("catalogue.rupture") : t("catalogue.ajouter")}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
