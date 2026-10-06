/**
 * Page "Albums photos" — liste (mockup #pg-albums, Release Plan §3.2, troisième lot
 * Phase 4B). Lecture seule depuis le 2026-09-22 (demande utilisateur : "Im Modul Album, sollen
 * Albums nur angezeigt werden. Die Verwaltung der Albums soll im Bereich Admin stattfinden.") —
 * la création/modification/suppression d'un album vit désormais exclusivement dans
 * AdminAlbumsPage (Bureau Admin+, voir AlbumPermission côté backend). Le détail (grille de
 * photos, likes, commentaires, visionneuse plein écran) vit dans AlbumDetailPage.
 *
 * ShareButton (ajouté le 2026-09-23, demande utilisateur "Man kann ein Album mitteilen") est
 * un SIBLING du <Link> de la carte, jamais un enfant : ShareButton rend lui-même des <a> dans
 * son menu de secours (WhatsApp/Facebook/X/email), et un <a> imbriqué dans le <Link> (qui rend
 * aussi un <a>) serait un HTML invalide en plus de déclencher la navigation de la carte au clic
 * — le bouton est donc positionné en superposition (absolute) plutôt qu'à l'intérieur du lien.
 *
 * Bannière de prévisualisation (demande utilisateur 2026-09-25, module "Fotoalben" :
 * "Fotoalben sollen mit einem Vorschau dargestellt werden als Banner in der Kachel") — voir
 * `Album.photo_couverture` côté backend (photo la plus récente non masquée) ; un album sans
 * photo garde la kachel texte-seule d'origine, sans espace réservé vide.
 */
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import ShareButton from "../../components/ui/ShareButton";
import { useAlbums } from "../../hooks/useCommunaute";
import { uebersetzt } from "../../utils/uebersetzung";

export default function AlbumsPage() {
  const { t } = useTranslation("communaute");
  const albumsQuery = useAlbums();

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-text-primary">{t("albums.titre")}</h1>

      {albumsQuery.isLoading && (
        <p className="text-sm text-text-tertiary">{t("albums.chargement")}</p>
      )}
      {albumsQuery.isError && (
        <p className="text-sm text-status-dangerText">{t("albums.erreur_chargement")}</p>
      )}
      {albumsQuery.data?.results.length === 0 && (
        <p className="text-sm text-text-tertiary">{t("albums.aucun_album")}</p>
      )}

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {albumsQuery.data?.results.map((album) => (
          <div key={album.id} className="relative">
            <Link
              to={`/albums/${album.id}`}
              className="block overflow-hidden rounded-cid-lg bg-bg-primary shadow-sm hover:bg-bg-secondary"
            >
              {album.photo_couverture && (
                <img
                  src={album.photo_couverture}
                  alt=""
                  className="aspect-video w-full object-cover"
                />
              )}
              <div className="p-3">
                <div className="pr-6 text-sm font-bold text-text-primary">
                  {uebersetzt(album, "nom")}
                </div>
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
              </div>
            </Link>
            <div className="absolute right-2 top-2">
              <ShareButton
                path={`/albums/${album.id}`}
                titre={album.nom}
                texte={[album.date, album.lieu].filter(Boolean).join(" · ") || undefined}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
