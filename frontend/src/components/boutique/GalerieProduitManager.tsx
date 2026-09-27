/**
 * Galerie photo d'un produit (demande utilisateur du 2026-09-27, point 13.1 : "mehr als ein Bild
 * pro Produkt hochladen können, User können sie im Shop anschauen") — panneau dépliable de
 * GestionCatalogueTab, même principe que VariantesManager/RegleReductionManager. La photo
 * "principale" (`Produit.image`, kachel du catalogue) reste gérée séparément par le bouton
 * "Bild hochladen" existant de GestionCatalogueTab — ce panneau ne gère que les photos
 * supplémentaires (`ProduitImage`, voir apps.boutique.models.ProduitImage), affichées côté membre
 * dans la galerie de ProduitDetailPage.
 *
 * Mêmes miniatures 16×16 avec bouton de suppression "×" que la galerie de AdminProjetsPage
 * (`ProjetImage`) — convention déjà établie côté Projets, reprise ici pour la cohérence visuelle.
 *
 * Lecture seule (task #216, 2026-09-24) : `modifiable` (optionnel, défaut `true`, voir
 * GestionCatalogueTab) désactive l'ajout/suppression des photos de galerie.
 */
import { useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

import { useAjouterImageProduit, useSupprimerImageProduit } from "../../hooks/useBoutique";
import type { Produit } from "../../types/boutique";
import { extractApiErrorMessage } from "../../utils/apiError";

export default function GalerieProduitManager({
  produit,
  modifiable = true,
}: {
  produit: Produit;
  modifiable?: boolean;
}) {
  const { t } = useTranslation(["boutique", "common"]);
  const ajouterMutation = useAjouterImageProduit();
  const supprimerMutation = useSupprimerImageProduit();
  const inputFichier = useRef<HTMLInputElement | null>(null);

  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [suppressionEnCoursId, setSuppressionEnCoursId] = useState<string | null>(null);

  function handleFichierChoisi(e: ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    e.target.value = "";
    if (!fichier || !modifiable) return;
    setEnCours(true);
    setErreur(null);
    ajouterMutation.mutate(
      { produit: produit.id, image: fichier },
      {
        onError: (err) =>
          setErreur(extractApiErrorMessage(err, t("catalogue_admin.galerie_erreur"))),
        onSettled: () => setEnCours(false),
      },
    );
  }

  function handleSupprimer(imageId: string) {
    if (!modifiable) return;
    setSuppressionEnCoursId(imageId);
    supprimerMutation.mutate(imageId, {
      onSettled: () => setSuppressionEnCoursId(null),
    });
  }

  return (
    <div className="mt-2 rounded-cid border border-text-tertiary/20 bg-bg-tertiary/40 p-3">
      <h3 className="mb-2 text-xs font-bold text-text-primary">
        {t("catalogue_admin.galerie_titre")}
      </h3>

      {produit.images.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {produit.images.map((image) => (
            <div key={image.id} className="relative h-16 w-16 overflow-hidden rounded-cid">
              <img src={image.image} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => handleSupprimer(image.id)}
                disabled={suppressionEnCoursId === image.id || !modifiable}
                title={!modifiable ? t("common:acces.lecture_seule_tooltip") ?? "" : ""}
                aria-label={t("catalogue_admin.galerie_supprimer") ?? ""}
                className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-bl bg-black/60 text-[10px] text-white disabled:opacity-40"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mb-2 text-xs text-text-tertiary">{t("catalogue_admin.galerie_vide")}</p>
      )}

      {erreur && <p className="mb-2 text-[11px] text-status-dangerText">{erreur}</p>}

      <input
        type="file"
        accept="image/*"
        ref={inputFichier}
        onChange={handleFichierChoisi}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputFichier.current?.click()}
        disabled={enCours || !modifiable}
        title={!modifiable ? t("common:acces.lecture_seule_tooltip") ?? "" : ""}
        className="rounded-cid border border-text-tertiary/30 px-2.5 py-1 text-xs text-text-secondary hover:bg-bg-tertiary disabled:opacity-40"
      >
        {enCours ? t("catalogue_admin.galerie_ajout_en_cours") : t("catalogue_admin.galerie_ajouter")}
      </button>
    </div>
  );
}
