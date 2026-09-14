/**
 * Page "Album photos" — détail (mockup #pg-albums, troisième lot Phase 4B).
 *
 * Grille de photos de l'album, upload collaboratif (tout membre authentifié — voir
 * AlbumPermission/PhotoPermission côté backend), likes/commentaires par photo, suppression
 * de sa propre photo, masquage réservé Bureau Admin+ (pas de modération sur les
 * likes/commentaires eux-mêmes pour ce sous-module, voir docstring de tête models.py).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import {
  useAlbum,
  useCommenterPhoto,
  useLikerPhoto,
  useMasquerPhoto,
  usePhotos,
  useSupprimerPhoto,
  useUploaderPhoto,
} from "../../hooks/useCommunaute";
import { hasRoleAtLeast, ROLE_LEVELS, useAuthStore } from "../../store/authStore";
import type { Photo } from "../../types/communaute";
import { extractApiErrorMessage } from "../../utils/apiError";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function PhotoCarte({ photo, peutModerer }: { photo: Photo; peutModerer: boolean }) {
  const { t } = useTranslation("communaute");
  const liker = useLikerPhoto();
  const masquer = useMasquerPhoto();
  const supprimer = useSupprimerPhoto();
  const commenter = useCommenterPhoto();

  const [afficherCommentaires, setAfficherCommentaires] = useState(false);
  const [texteCommentaire, setTexteCommentaire] = useState("");
  const [erreur, setErreur] = useState("");

  function soumettreCommentaire(e: React.FormEvent) {
    e.preventDefault();
    if (!texteCommentaire.trim()) return;
    commenter.mutate(
      { photoId: photo.id, contenu: texteCommentaire },
      {
        onSuccess: () => setTexteCommentaire(""),
        onError: (err) => setErreur(extractApiErrorMessage(err, t("albums.erreur_commentaire"))),
      },
    );
  }

  return (
    <div className="overflow-hidden rounded-cid-lg bg-bg-primary shadow-sm">
      <div className="relative">
        <img src={photo.image} alt={photo.legende} className="h-48 w-full object-cover" />
        {photo.est_masquee && (
          <span className="absolute right-2 top-2 rounded bg-status-dangerBg px-1.5 py-0.5 text-[9px] font-bold text-status-dangerText">
            {t("albums.masquee_badge")}
          </span>
        )}
      </div>
      <div className="p-2">
        {photo.legende && <p className="mb-1 text-xs text-text-secondary">{photo.legende}</p>}
        <div className="flex items-center gap-3 text-xs text-text-tertiary">
          <button
            type="button"
            onClick={() => liker.mutate(photo.id)}
            className={`flex items-center gap-1 hover:text-ca ${photo.jaime ? "font-bold text-ca" : ""}`}
          >
            ♥ {photo.nombre_likes}
          </button>
          <button
            type="button"
            onClick={() => setAfficherCommentaires((v) => !v)}
            className="flex items-center gap-1 hover:text-ca"
          >
            💬 {photo.commentaires.length}
          </button>
          <div className="ml-auto flex gap-2">
            {photo.est_proprietaire && (
              <button
                type="button"
                onClick={() => supprimer.mutate(photo.id)}
                className="hover:underline"
              >
                {t("albums.supprimer")}
              </button>
            )}
            {peutModerer && !photo.est_proprietaire && (
              <button
                type="button"
                onClick={() => masquer.mutate(photo.id)}
                className="hover:underline"
              >
                {t("albums.masquer")}
              </button>
            )}
          </div>
        </div>

        {afficherCommentaires && (
          <div className="mt-2 space-y-1.5 border-t border-text-tertiary/10 pt-2">
            {photo.commentaires.map((commentaire) => (
              <div key={commentaire.id} className="text-xs">
                <span className="font-bold text-text-primary">
                  {commentaire.auteur.prenom} {commentaire.auteur.nom}
                </span>{" "}
                <span className="text-text-secondary">{commentaire.contenu}</span>
              </div>
            ))}
            <form onSubmit={soumettreCommentaire} className="flex gap-2">
              <input
                type="text"
                value={texteCommentaire}
                onChange={(e) => setTexteCommentaire(e.target.value)}
                placeholder={t("albums.placeholder_commentaire")}
                className="flex-1 rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs"
              />
              <button
                type="submit"
                className="rounded-cid bg-ca px-3 py-1 text-xs font-medium text-white hover:bg-cad"
              >
                {t("albums.envoyer")}
              </button>
            </form>
            {erreur && <p className="text-xs text-status-dangerText">{erreur}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AlbumDetailPage() {
  const { t } = useTranslation("communaute");
  const { id } = useParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);
  const peutModerer = hasRoleAtLeast(user, ROLE_LEVELS.bureau_admin);

  const albumQuery = useAlbum(id);
  const photosQuery = usePhotos({ album: id });
  const uploader = useUploaderPhoto();

  const [image, setImage] = useState<File | undefined>(undefined);
  const [legende, setLegende] = useState("");
  const [erreur, setErreur] = useState("");

  function soumettre(e: React.FormEvent) {
    e.preventDefault();
    if (!image || !id) return;
    uploader.mutate(
      { album: id, image, legende },
      {
        onSuccess: () => {
          setImage(undefined);
          setLegende("");
          setErreur("");
        },
        onError: (err) => setErreur(extractApiErrorMessage(err, t("albums.erreur_upload"))),
      },
    );
  }

  return (
    <div>
      <Link to="/albums" className="mb-3 inline-block text-xs text-ca hover:underline">
        {t("albums.retour_liste")}
      </Link>

      {albumQuery.data && (
        <div className="mb-4">
          <h1 className="text-lg font-bold text-text-primary">{albumQuery.data.nom}</h1>
          {albumQuery.data.description && (
            <p className="text-sm text-text-tertiary">{albumQuery.data.description}</p>
          )}
        </div>
      )}

      <form onSubmit={soumettre} className="mb-4 rounded-cid-lg bg-bg-primary p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label={t("albums.ajouter_photo")}
            onChange={(e) => setImage(e.target.files?.[0])}
            className="text-xs text-text-tertiary"
          />
          <input
            type="text"
            value={legende}
            onChange={(e) => setLegende(e.target.value)}
            placeholder={t("albums.legende_placeholder")}
            className="min-w-[10rem] flex-1 rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={!image || uploader.isPending}
            className="rounded-cid bg-ca px-4 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
          >
            {t("albums.publier_photo")}
          </button>
        </div>
        {erreur && <p className="mt-1 text-xs text-status-dangerText">{erreur}</p>}
      </form>

      {photosQuery.isLoading && <p className="text-sm text-text-tertiary">{t("albums.chargement")}</p>}
      {photosQuery.data?.results.length === 0 && (
        <p className="text-sm text-text-tertiary">{t("albums.aucune_photo")}</p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {photosQuery.data?.results.map((photo) => (
          <PhotoCarte key={photo.id} photo={photo} peutModerer={peutModerer} />
        ))}
      </div>

      {albumQuery.data && (
        <p className="mt-2 text-[10px] text-text-tertiary">{formatDate(albumQuery.data.created_at)}</p>
      )}
    </div>
  );
}
