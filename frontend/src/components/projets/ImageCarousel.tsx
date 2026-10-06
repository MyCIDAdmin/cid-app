import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/** Élément affichable par le carrousel — sous-ensemble commun à ProjetImage (kachel) ET
 * ProjetMiseAJourImage (rapport d'avancement, voir RapportModal) : seuls `id` (clé React) et
 * `image` (URL) sont utilisés ici, donc ce composant reste volontairement indépendant du type
 * exact de son appelant plutôt que d'importer ProjetImage et forcer RapportModal à retyper ses
 * ProjetMiseAJourImage. */
interface CarouselImage {
  id: string;
  image: string;
}

interface ImageCarouselProps {
  images: CarouselImage[];
  /** Titre du projet — utilisé uniquement pour le texte alternatif des images (demande
   * utilisateur point 1.1 : pas de légende visible par image, juste le carrousel lui-même). */
  titre: string;
  /** Intervalle de rotation automatique, en millisecondes (demande utilisateur point 1.1 :
   * "Die Bilder sollen automatisch nach ander wechselnd angezeigt [werden]"). */
  intervalMs?: number;
  className?: string;
  /** "cover" : Bild füllt die Fläche vollständig (Kacheln, 2026-10-06) ; "contain" : ganzes Bild. */
  fit?: "cover" | "contain";
}

/**
 * Carrousel d'images auto-rotatif (demande utilisateur point 1.1) — composant "maison", sans
 * bibliothèque tierce (aucune bibliothèque de carrousel/slider installée dans le projet, voir
 * package.json ; cohérent avec le reste du code, entièrement composants faits main). La
 * rotation automatique se met en pause au survol/focus clavier pour rester lisible.
 */
export default function ImageCarousel({
  images,
  titre,
  intervalMs = 4000,
  className = "",
  fit = "contain",
}: ImageCarouselProps) {
  const { t } = useTranslation("projets");
  const [index, setIndex] = useState(0);
  const [enPause, setEnPause] = useState(false);

  // Reste dans les bornes si la liste d'images change (ex. suppression) pendant que `index`
  // pointait sur une position désormais hors limites.
  useEffect(() => {
    if (index >= images.length) {
      setIndex(0);
    }
  }, [images.length, index]);

  useEffect(() => {
    if (images.length <= 1 || enPause) return undefined;
    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % images.length);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [images.length, intervalMs, enPause]);

  if (images.length === 0) {
    return (
      <div
        className={`flex items-center justify-center bg-bg-tertiary text-text-tertiary ${className}`}
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor">
          <rect x="3" y="5" width="18" height="14" rx="2" strokeWidth="1.5" />
          <circle cx="8.5" cy="10" r="1.5" strokeWidth="1.5" />
          <path
            d="M21 15l-5-5-9 9"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }

  const image = images[index];

  return (
    <div
      className={`group relative overflow-hidden bg-bg-tertiary ${className}`}
      onMouseEnter={() => setEnPause(true)}
      onMouseLeave={() => setEnPause(false)}
      onFocus={() => setEnPause(true)}
      onBlur={() => setEnPause(false)}
    >
      <img
        key={image.id}
        src={image.image}
        alt={t("carousel.image_alt", { titre, n: index + 1 }) ?? ""}
        // object-contain (plutôt qu'object-cover, jusqu'au 2026-09-22) : la kachel étant
        // désormais bien plus large qu'avant (pleine largeur de page), object-cover forçait un
        // recadrage beaucoup plus agressif de l'image dans cette bande large et peu haute (h-40)
        // — coupant une grande partie visible et donnant une impression de flou/pixellisation en
        // zoomant sur une portion de l'image. object-contain affiche toujours l'image ENTIÈRE
        // (letterboxée au besoin sur les côtés, sur le fond bg-bg-tertiary du conteneur), jamais
        // recadrée.
        className={`h-full w-full ${fit === "cover" ? "object-cover" : "object-contain"} transition-opacity duration-500`}
      />
      {images.length > 1 && (
        <>
          <button
            type="button"
            aria-label={t("carousel.image_precedente") ?? ""}
            onClick={(e) => {
              e.stopPropagation();
              setIndex((i) => (i - 1 + images.length) % images.length);
            }}
            className="absolute left-1.5 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label={t("carousel.image_suivante") ?? ""}
            onClick={(e) => {
              e.stopPropagation();
              setIndex((i) => (i + 1) % images.length);
            }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
          >
            ›
          </button>
          <div className="absolute bottom-1.5 left-1/2 flex -translate-x-1/2 gap-1">
            {images.map((img, i) => (
              <button
                key={img.id}
                type="button"
                aria-label={t("carousel.aller_a_image", { n: i + 1 }) ?? ""}
                aria-current={i === index}
                onClick={(e) => {
                  e.stopPropagation();
                  setIndex(i);
                }}
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  i === index ? "bg-white" : "bg-white/50"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
