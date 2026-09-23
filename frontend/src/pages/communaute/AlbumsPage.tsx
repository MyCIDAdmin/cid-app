/**
 * Page "Albums photos" — liste (mockup #pg-albums, Release Plan §3.2, troisième lot
 * Phase 4B). Lecture seule depuis le 2026-09-22 (demande utilisateur : "Im Modul Album, sollen
 * Albums nur angezeigt werden. Die Verwaltung der Albums soll im Bereich Admin stattfinden.") —
 * la création/modification/suppression d'un album vit désormais exclusivement dans
 * AdminAlbumsPage (Bureau Admin+, voir AlbumPermission côté backend). Le détail (grille de
 * photos, likes, commentaires) vit dans AlbumDetailPage.
 */
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useAlbums } from "../../hooks/useCommunaute";

export default function AlbumsPage() {
  const { t } = useTranslation("communaute");
  const albumsQuery = useAlbums();

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-text-primary">{t("albums.titre")}</h1>

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
            {album.evenement && (
              <div className="text-xs text-text-tertiary">{album.evenement.titre}</div>
            )}
            {(album.date || album.lieu) && (
              <div className="text-xs text-text-tertiary">
                {[album.date, album.lieu].filter(Boolean).join(" · ")}
              </div>
            )}
            <div className="mt-1 text-[10px] text-text-tertiary">
              {t("albums.nombre_photos", { count: album.nombre_photos })}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
