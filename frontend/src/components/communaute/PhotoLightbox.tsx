/**
 * Visionneuse plein écran ("Photoanzeige Tool als Box") — ajoutée le 2026-09-23 sur demande
 * utilisateur ("Beim klicken auf Photo kann man die Photos in einem Photoanzeige Tool als
 * Box [sehen]") : cliquer sur une photo de l'album (AlbumDetailPage) l'ouvre en grand dans
 * une boîte modale plutôt que de rester à la taille de la vignette de la grille, avec
 * navigation entre toutes les photos de l'album sans revenir à la grille.
 *
 * Même gabarit de modale que ConfirmDialog/DatenschutzhinweisModal (role=dialog + overlay +
 * fermeture au clic extérieur) mais fond quasi-opaque (plutôt que bg-black/40) pour mettre la
 * photo en valeur, comme une visionneuse d'image classique. Navigation clavier (flèches/Échap)
 * en plus des boutons, même principe que RailGroupButton (Sidebar.tsx) pour Échap.
 *
 * `index`/`onNavigate` sont contrôlés par le parent (AlbumDetailPage) plutôt qu'un état interne
 * ici, pour que la grille sache quelle photo est actuellement affichée en grand (pas utilisé
 * aujourd'hui, mais évite un état dupliqué qui pourrait diverger).
 */
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import type { Photo } from "../../types/communaute";

interface PhotoLightboxProps {
  photos: Photo[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export default function PhotoLightbox({ photos, index, onClose, onNavigate }: PhotoLightboxProps) {
  const { t } = useTranslation("communaute");
  const photo = photos[index];
  const plusieursPhotos = photos.length > 1;

  useEffect(() => {
    function surTouche(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      } else if (plusieursPhotos && e.key === "ArrowLeft") {
        onNavigate((index - 1 + photos.length) % photos.length);
      } else if (plusieursPhotos && e.key === "ArrowRight") {
        onNavigate((index + 1) % photos.length);
      }
    }
    document.addEventListener("keydown", surTouche);
    return () => document.removeEventListener("keydown", surTouche);
  }, [index, photos.length, plusieursPhotos, onClose, onNavigate]);

  if (!photo) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={photo.legende || t("visionneuse.ouvrir") || ""}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={t("visionneuse.fermer") ?? ""}
        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-2xl text-white/80 hover:bg-white/10 hover:text-white"
      >
        ×
      </button>

      {plusieursPhotos && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate((index - 1 + photos.length) % photos.length);
          }}
          aria-label={t("visionneuse.image_precedente") ?? ""}
          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-2xl text-white hover:bg-black/60 sm:left-4"
        >
          ‹
        </button>
      )}

      <figure
        className="flex max-h-full max-w-full flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={photo.image}
          alt={photo.legende}
          className="max-h-[80vh] max-w-full rounded-cid object-contain"
        />
        {photo.legende && (
          <figcaption className="mt-3 max-w-lg text-center text-sm text-white/90">
            {photo.legende}
          </figcaption>
        )}
        {plusieursPhotos && (
          <div className="mt-2 text-xs text-white/60">
            {t("visionneuse.compteur", { n: index + 1, total: photos.length })}
          </div>
        )}
      </figure>

      {plusieursPhotos && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate((index + 1) % photos.length);
          }}
          aria-label={t("visionneuse.image_suivante") ?? ""}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-2xl text-white hover:bg-black/60 sm:right-4"
        >
          ›
        </button>
      )}
    </div>
  );
}
