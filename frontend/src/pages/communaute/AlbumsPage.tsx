/**
 * Page "Albums photos" — liste (mockup #pg-albums, Release Plan §3.2, troisième lot
 * Phase 4B). Lecture seule depuis le 2026-09-22 (demande utilisateur : "Im Modul Album, sollen
 * Albums nur angezeigt werden. Die Verwaltung der Albums soll im Bereich Admin stattfinden.") —
 * la création/modification/suppression d'un album vit désormais exclusivement dans
 * AdminAlbumsPage (Bureau Admin+, voir AlbumPermission côté backend). Le détail (grille de
 * photos, likes, commentaires, visionneuse plein écran) vit dans AlbumDetailPage.
 *
 * Retours du 2026-10-21 :
 * - Teilen nur für Bureau Admin+ (nie für Mitglieder oder Besucher der öffentlichen Startseite) ;
 *   der Button liegt als SIBLING des <Link> (kein <a> in <a>, siehe ShareButton) auf einem
 *   hellen Kreis, damit er auch über dem Titelbild sichtbar ist.
 * - Das Titelbild füllt die ganze Kachel (einheitliches Format, Text darüber), statt oben als
 *   zugeschnittener Streifen zu sitzen. Ein Album ohne Foto behält eine gleich große Kachel.
 * - `publicModus` (eingebettet in die öffentliche Startseite): Klick öffnet das Album dort
 *   (`/?onglet=galerie&album=<id>`) statt auf der Anmeldeseite zu landen.
 */
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import ShareButton from "../../components/ui/ShareButton";
import { useAlbums } from "../../hooks/useCommunaute";
import { hasRoleAtLeast, ROLE_LEVELS, useAuthStore } from "../../store/authStore";
import { albumPfad } from "../../utils/albumPfad";
import { uebersetzt } from "../../utils/uebersetzung";

export default function AlbumsPage({ publicModus = false }: { publicModus?: boolean }) {
  const { t } = useTranslation("communaute");
  const albumsQuery = useAlbums();
  const user = useAuthStore((s) => s.user);
  const darfTeilen = !publicModus && hasRoleAtLeast(user, ROLE_LEVELS.bureau_admin);

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
        {albumsQuery.data?.results.map((album) => {
          const untertitel = [album.date, album.lieu].filter(Boolean).join(" · ");
          const mitBild = !!album.photo_couverture;
          return (
            <div key={album.id} className="relative">
              <Link
                to={publicModus ? albumPfad(album, true) : `/albums/${album.id}`}
                className="relative block aspect-[4/3] overflow-hidden rounded-cid-lg bg-bg-primary shadow-sm hover:shadow-md"
              >
                {mitBild && (
                  <>
                    <img
                      src={album.photo_couverture ?? ""}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                  </>
                )}
                <div
                  className={`absolute inset-x-0 bottom-0 p-3 ${
                    mitBild ? "text-white" : "text-text-primary"
                  }`}
                >
                  <div className="pr-6 text-sm font-bold">{uebersetzt(album, "nom")}</div>
                  {album.evenement && (
                    <div className={`text-xs ${mitBild ? "text-white/80" : "text-text-tertiary"}`}>
                      {album.evenement.titre}
                    </div>
                  )}
                  {album.projet && (
                    <div className={`text-xs ${mitBild ? "text-white/80" : "text-text-tertiary"}`}>
                      {album.projet.titre}
                    </div>
                  )}
                  {untertitel && (
                    <div className={`text-xs ${mitBild ? "text-white/80" : "text-text-tertiary"}`}>
                      {untertitel}
                    </div>
                  )}
                  <div
                    className={`mt-1 text-[10px] ${mitBild ? "text-white/70" : "text-text-tertiary"}`}
                  >
                    {t("albums.nombre_photos", { count: album.nombre_photos })}
                  </div>
                </div>
              </Link>
              {darfTeilen && (
                <div className="absolute right-2 top-2 rounded-full bg-bg-primary/90 shadow">
                  <ShareButton
                    path={albumPfad(album, album.oeffentlich)}
                    titre={album.nom}
                    texte={untertitel || undefined}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
