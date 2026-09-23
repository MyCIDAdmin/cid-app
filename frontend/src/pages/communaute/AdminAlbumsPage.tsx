/**
 * Page "Albums photos — Administration" (Bureau Admin+, module resserré le 2026-09-22 sur
 * demande utilisateur : "Im Modul Album, sollen Albums nur angezeigt werden. Die Verwaltung der
 * Albums soll im Bereich Admin stattfinden."). CRUD complet de l'Album (nom, description, date,
 * lieu — champs libres distincts de `evenement`, voir docstring de AlbumPayload côté
 * frontend/types) + upload de plusieurs photos à la fois, mêmes principes qu'AdminProjetsPage :
 * l'entité (Album) est d'abord créée/modifiée, PUIS chaque photo sélectionnée est envoyée
 * séquentiellement en la référençant (voir AlbumPermission/PhotoPermission côté backend — create
 * réservé Bureau Admin+ pour les deux depuis ce même changement).
 *
 * La page membre (AlbumsPage/AlbumDetailPage) reste en lecture seule (+ like/commentaire/
 * suppression de sa propre photo, qui restent des actions ordinaires, pas de la "Verwaltung") ;
 * "Voir" ci-dessous renvoie donc vers /albums/:id, sans page de détail admin séparée — un Bureau
 * Admin+ y voit de toute façon déjà les contrôles de modération (masquer une photo), voir
 * AlbumDetailPage.peutModerer.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import ConfirmDialog from "../../components/ui/ConfirmDialog";
import {
  useAlbums,
  useCreerAlbum,
  useModifierAlbum,
  usePhotos,
  useSupprimerAlbum,
  useSupprimerPhoto,
  useUploaderPhoto,
} from "../../hooks/useCommunaute";
import type { Album, AlbumPayload } from "../../types/communaute";
import { extractApiErrorMessage } from "../../utils/apiError";

const FORMULAIRE_VIDE: AlbumPayload = {
  nom: "",
  description: "",
  date: null,
  lieu: "",
};

function FormulaireAlbum({ album, onTermine }: { album: Album | null; onTermine: () => void }) {
  const { t } = useTranslation(["communaute", "common"]);
  const creer = useCreerAlbum();
  const modifier = useModifierAlbum();
  const uploader = useUploaderPhoto();
  const supprimerPhoto = useSupprimerPhoto();
  // N'interroge les photos existantes qu'en édition (usePhotos ne se déclenche de toute façon pas
  // sans `album`, voir son `enabled` — inutile ici lors d'une création, l'album n'a pas encore d'id).
  const photosQuery = usePhotos({ album: album?.id });

  const [valeurs, setValeurs] = useState<AlbumPayload>(
    album
      ? { nom: album.nom, description: album.description, date: album.date, lieu: album.lieu }
      : FORMULAIRE_VIDE,
  );
  const [nouvellesImages, setNouvellesImages] = useState<File[]>([]);
  const [erreur, setErreur] = useState("");

  const enCours = creer.isPending || modifier.isPending;

  function champ<K extends keyof AlbumPayload>(cle: K, valeur: AlbumPayload[K]) {
    setValeurs((v) => ({ ...v, [cle]: valeur }));
  }

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    if (!valeurs.nom.trim()) return;
    setErreur("");

    try {
      const resultat = album
        ? await modifier.mutateAsync({ id: album.id, payload: valeurs })
        : await creer.mutateAsync(valeurs);
      // Les nouvelles photos sélectionnées (création ET édition) sont envoyées séquentiellement
      // APRÈS l'enregistrement de l'Album lui-même, puisqu'elles référencent son id — même
      // principe que FormulaireProjet.soumettre (AdminProjetsPage).
      for (const fichier of nouvellesImages) {
        await uploader.mutateAsync({ album: resultat.id, image: fichier });
      }
      onTermine();
    } catch (err) {
      setErreur(extractApiErrorMessage(err, t("admin_albums.erreur_enregistrement")));
    }
  }

  return (
    <form onSubmit={soumettre} className="space-y-3 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
      <h2 className="text-sm font-bold text-text-primary">
        {album ? t("admin_albums.modifier_album") : t("admin_albums.nouvel_album")}
      </h2>
      <div>
        <label
          htmlFor="admin-album-nom"
          className="mb-1 block text-xs font-medium text-text-secondary"
        >
          {t("admin_albums.champ_nom")} <span className="text-status-dangerText">*</span>
        </label>
        <input
          id="admin-album-nom"
          type="text"
          value={valeurs.nom}
          onChange={(e) => champ("nom", e.target.value)}
          className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
        />
      </div>

      <div>
        <label
          htmlFor="admin-album-description"
          className="mb-1 block text-xs font-medium text-text-secondary"
        >
          {t("admin_albums.champ_description")}
        </label>
        <textarea
          id="admin-album-description"
          value={valeurs.description ?? ""}
          onChange={(e) => champ("description", e.target.value)}
          rows={3}
          className="w-full resize-none rounded-cid border border-text-tertiary/30 p-2 text-sm"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor="admin-album-date"
            className="mb-1 block text-xs font-medium text-text-secondary"
          >
            {t("admin_albums.champ_date")}
          </label>
          <input
            id="admin-album-date"
            type="date"
            value={valeurs.date ?? ""}
            onChange={(e) => champ("date", e.target.value || null)}
            className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="admin-album-lieu"
            className="mb-1 block text-xs font-medium text-text-secondary"
          >
            {t("admin_albums.champ_lieu")}
          </label>
          <input
            id="admin-album-lieu"
            type="text"
            value={valeurs.lieu ?? ""}
            onChange={(e) => champ("lieu", e.target.value)}
            className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-text-secondary">
          {t("admin_albums.images_titre")}
        </label>
        {album && (photosQuery.data?.results.length ?? 0) > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {photosQuery.data?.results.map((photo) => (
              <div key={photo.id} className="relative h-16 w-16 overflow-hidden rounded-cid">
                <img src={photo.image} alt={photo.legende} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => supprimerPhoto.mutate(photo.id)}
                  aria-label={t("admin_albums.supprimer") ?? ""}
                  className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-bl bg-black/60 text-[10px] text-white"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          aria-label={t("admin_albums.ajouter_images") ?? ""}
          onChange={(e) => setNouvellesImages(Array.from(e.target.files ?? []))}
          className="block w-full text-xs text-text-secondary"
        />
      </div>

      {erreur && <p className="text-xs text-status-dangerText">{erreur}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onTermine}
          className="rounded-cid px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-secondary"
        >
          {t("common:action.annuler")}
        </button>
        <button
          type="submit"
          disabled={enCours}
          className="rounded-cid bg-ca px-4 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
        >
          {album ? t("admin_albums.enregistrer") : t("admin_albums.nouvel_album")}
        </button>
      </div>
    </form>
  );
}

export default function AdminAlbumsPage() {
  const { t } = useTranslation(["communaute", "common"]);
  const albumsQuery = useAlbums();
  const supprimer = useSupprimerAlbum();

  const [afficherFormulaire, setAfficherFormulaire] = useState(false);
  const [albumEnEdition, setAlbumEnEdition] = useState<Album | null>(null);
  const [albumASupprimer, setAlbumASupprimer] = useState<Album | null>(null);
  const [erreurAction, setErreurAction] = useState("");

  function ouvrirCreation() {
    setAlbumEnEdition(null);
    setAfficherFormulaire(true);
  }

  function ouvrirEdition(album: Album) {
    setAlbumEnEdition(album);
    setAfficherFormulaire(true);
  }

  function fermerFormulaire() {
    setAfficherFormulaire(false);
    setAlbumEnEdition(null);
  }

  function confirmerSuppression() {
    if (!albumASupprimer) return;
    supprimer.mutate(albumASupprimer.id, {
      onError: (err) =>
        setErreurAction(extractApiErrorMessage(err, t("admin_albums.erreur_enregistrement"))),
    });
    setAlbumASupprimer(null);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary">{t("admin_albums.titre")}</h1>
        {!afficherFormulaire && (
          <button
            type="button"
            onClick={ouvrirCreation}
            className="rounded-cid bg-ca px-4 py-1.5 text-xs font-medium text-white hover:bg-cad"
          >
            {t("admin_albums.nouvel_album")}
          </button>
        )}
      </div>

      {afficherFormulaire && (
        <div className="mb-5">
          <FormulaireAlbum album={albumEnEdition} onTermine={fermerFormulaire} />
        </div>
      )}

      {erreurAction && <p className="mb-2 text-xs text-status-dangerText">{erreurAction}</p>}

      {albumsQuery.isLoading && <p className="text-sm text-text-tertiary">{t("albums.chargement")}</p>}
      {albumsQuery.data?.results.length === 0 && (
        <p className="text-sm text-text-tertiary">{t("albums.aucun_album")}</p>
      )}

      <div className="space-y-2">
        {albumsQuery.data?.results.map((album) => (
          <div key={album.id} className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-text-primary">{album.nom}</div>
                <div className="text-xs text-text-tertiary">
                  {[album.date, album.lieu].filter(Boolean).join(" · ")}
                  {(album.date || album.lieu) && " · "}
                  {t("albums.nombre_photos", { count: album.nombre_photos })}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link
                  to={`/albums/${album.id}`}
                  className="rounded-cid px-3 py-1 text-xs font-medium text-text-secondary hover:bg-bg-secondary"
                >
                  {t("admin_albums.voir")}
                </Link>
                <button
                  type="button"
                  onClick={() => ouvrirEdition(album)}
                  className="rounded-cid px-3 py-1 text-xs font-medium text-text-secondary hover:bg-bg-secondary"
                >
                  {t("admin_albums.modifier")}
                </button>
                <button
                  type="button"
                  onClick={() => setAlbumASupprimer(album)}
                  className="rounded-cid px-3 py-1 text-xs font-medium text-status-dangerText hover:bg-status-dangerBg"
                >
                  {t("admin_albums.supprimer")}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={albumASupprimer !== null}
        title={t("admin_albums.supprimer")}
        message={t("admin_albums.confirmer_suppression")}
        danger
        onConfirm={confirmerSuppression}
        onCancel={() => setAlbumASupprimer(null)}
      />
    </div>
  );
}
