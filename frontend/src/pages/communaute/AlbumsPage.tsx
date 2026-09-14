/**
 * Page "Albums photos" — liste (mockup #pg-albums, Release Plan §3.2, troisième lot
 * Phase 4B). Lecture/création ouvertes à tout authentifié — "upload collaboratif", un album
 * se crée comme n'importe quelle publication (voir AlbumPermission côté backend). Le détail
 * (grille de photos, upload, likes, commentaires) vit dans AlbumDetailPage.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useAlbums, useCreerAlbum } from "../../hooks/useCommunaute";
import { extractApiErrorMessage } from "../../utils/apiError";

export default function AlbumsPage() {
  const { t } = useTranslation("communaute");
  const albumsQuery = useAlbums();
  const creer = useCreerAlbum();

  const [afficherFormulaire, setAfficherFormulaire] = useState(false);
  const [nom, setNom] = useState("");
  const [description, setDescription] = useState("");
  const [evenement, setEvenement] = useState("");
  const [erreur, setErreur] = useState("");

  function creerAlbum(e: React.FormEvent) {
    e.preventDefault();
    if (!nom.trim()) return;
    creer.mutate(
      { nom, description, evenement },
      {
        onSuccess: () => {
          setNom("");
          setDescription("");
          setEvenement("");
          setAfficherFormulaire(false);
          setErreur("");
        },
        onError: (err) => setErreur(extractApiErrorMessage(err, t("albums.erreur_creation"))),
      },
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary">{t("albums.titre")}</h1>
        <button
          type="button"
          onClick={() => setAfficherFormulaire((v) => !v)}
          className="rounded-cid bg-ca px-4 py-1.5 text-xs font-medium text-white hover:bg-cad"
        >
          {t("albums.nouvel_album")}
        </button>
      </div>

      {afficherFormulaire && (
        <form onSubmit={creerAlbum} className="mb-4 space-y-2 rounded-cid-lg bg-bg-primary p-3 shadow-sm">
          <input
            type="text"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder={t("albums.nom_placeholder")}
            className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("albums.description_placeholder")}
            rows={2}
            className="w-full resize-none rounded-cid border border-text-tertiary/30 p-2 text-sm"
          />
          <input
            type="text"
            value={evenement}
            onChange={(e) => setEvenement(e.target.value)}
            placeholder={t("albums.evenement_placeholder")}
            className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={creer.isPending}
            className="rounded-cid bg-ca px-4 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
          >
            {t("albums.creer")}
          </button>
          {erreur && <p className="text-xs text-status-dangerText">{erreur}</p>}
        </form>
      )}

      {albumsQuery.isLoading && <p className="text-sm text-text-tertiary">{t("albums.chargement")}</p>}
      {albumsQuery.isError && (
        <p className="text-sm text-status-dangerText">{t("albums.erreur_chargement")}</p>
      )}
      {albumsQuery.data?.results.length === 0 && (
        <p className="text-sm text-text-tertiary">{t("albums.aucun_album")}</p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {albumsQuery.data?.results.map((album) => (
          <Link
            key={album.id}
            to={`/albums/${album.id}`}
            className="block rounded-cid-lg bg-bg-primary p-3 shadow-sm hover:bg-bg-secondary"
          >
            <div className="text-sm font-bold text-text-primary">{album.nom}</div>
            {album.evenement && <div className="text-xs text-text-tertiary">{album.evenement}</div>}
            <div className="mt-1 text-[10px] text-text-tertiary">
              {t("albums.nombre_photos", { count: album.nombre_photos })}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
