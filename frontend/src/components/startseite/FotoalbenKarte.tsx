/**
 * Fotoalben der Startseite nach der Anmeldung (Vorschlag B, 2026-11) : Streifen mit den neuesten
 * Alben (Titelbild, Name, Anzahl Fotos), horizontal wischbar. Nutzt die vorhandene Albenliste ;
 * ohne Alben oder bei geschlossenem Modul „Fotoalben“ erscheint nichts.
 */
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useAlbums } from "../../hooks/useCommunaute";
import { useModuleOuvert } from "../../hooks/useRbac";
import { uebersetzt } from "../../utils/uebersetzung";

const MAX_ALBEN = 8;

function Streifen() {
  const { t } = useTranslation("public");
  const { data } = useAlbums();
  const alben = (data?.results ?? []).filter((a) => a.nombre_photos > 0).slice(0, MAX_ALBEN);
  if (alben.length === 0) return null;

  return (
    <section
      aria-labelledby="alben-titel"
      className="h-full min-w-0 rounded-cid-lg bg-bg-primary p-4 shadow-sm sm:p-6"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="alben-titel" className="font-display text-lg font-bold text-text-primary">
          {t("startseite.alben.titel")}
        </h2>
        <Link
          to="/albums"
          className="rounded-cid border border-text-tertiary/30 px-3 py-1 text-xs font-semibold text-text-primary hover:border-ca"
        >
          {t("startseite.alben.alle")} →
        </Link>
      </div>
      <ul className="flex snap-x gap-3 overflow-x-auto pb-2">
        {alben.map((album) => (
          <li key={album.id} className="w-36 shrink-0 snap-start">
            <Link
              to={`/albums/${album.id}`}
              className="relative block h-28 overflow-hidden rounded-cid-lg bg-gradient-to-br from-ca to-cad"
            >
              {album.photo_couverture && (
                <img
                  src={album.photo_couverture}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-6 text-xs font-semibold leading-tight text-white">
                {uebersetzt(album, "nom")}
                <span className="block font-normal text-white/80">
                  {t("startseite.alben.fotos", { count: album.nombre_photos })}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function FotoalbenKarte() {
  const { ouvert } = useModuleOuvert("albums");
  if (!ouvert) return null;
  return <Streifen />;
}
