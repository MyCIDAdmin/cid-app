import { IconPlayerPause, IconPlayerPlay } from "@tabler/icons-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Fond vidéo du hero de la page d'accueil publique (demande utilisateur du 2026-09-27, Phase 5
 * "Startseite Hero-Video" : "un video im hero bereich", autoplay muet + boucle). Purement
 * présentationnel — ne récupère rien lui-même : `AccueilTab.tsx` appelle
 * `useConfigurationSitePublic()` et ne monte ce composant QUE lorsqu'une vidéo est configurée
 * (`videoUrl` non vide), pour que l'apparence du hero (dégradé de marque + texte blanc,
 * voir AccueilTab.tsx) ne change que lorsqu'une vidéo existe réellement — le hero par défaut
 * (aucune vidéo configurée) reste inchangé.
 *
 * `autoPlay`+`muted`+`playsInline` est la combinaison exigée par les navigateurs (Chrome/Safari
 * iOS notamment) pour autoriser la lecture automatique sans interaction utilisateur — sans
 * `muted`, `autoPlay` est silencieusement ignoré ; sans `playsInline`, Safari iOS ouvre la vidéo
 * en plein écran au lieu de la jouer en fond. `loop` boucle indéfiniment (mockup mycid.org : fond
 * de hero toujours animé). `key={videoUrl}` force un remount (donc un rechargement) si l'admin
 * remplace la vidéo pendant qu'un visiteur a la page ouverte (React ne recharge pas `src` seul
 * sur un élément `<video>` déjà monté).
 */

/** Nutzer mit „Bewegung reduzieren“ bekommen kein Autoplay (WCAG 2.3.3). */
function bewegungReduziert(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export default function HeroVideo({ videoUrl }: { videoUrl: string }) {
  const { t } = useTranslation("common");
  const videoRef = useRef<HTMLVideoElement>(null);
  const [laeuft, setLaeuft] = useState(() => !bewegungReduziert());

  function umschalten() {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (laeuft) video.pause();
      else void video.play()?.catch(() => undefined);
    } catch {
      /* Wiedergabe nicht verfügbar — Zustand trotzdem umschalten */
    }
    setLaeuft(!laeuft);
  }

  return (
    <>
      <video
        ref={videoRef}
        key={videoUrl}
        src={videoUrl}
        autoPlay={laeuft}
        muted
        loop
        playsInline
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
      />
      {/* Pause-Knopf (WCAG 2.2.2): automatisch startende, endlose Bewegung muss stoppbar sein. */}
      <button
        type="button"
        onClick={umschalten}
        aria-label={laeuft ? t("video.pause") : t("video.lecture")}
        className="absolute bottom-3 right-3 z-10 rounded-full bg-black/50 p-2 text-white transition hover:bg-black/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        {laeuft ? <IconPlayerPause size={16} /> : <IconPlayerPlay size={16} />}
      </button>
      {/* Assombrit la vidéo côté texte (gauche) pour garder le hero lisible quel que soit le
          contenu de la vidéo, sans couvrir la vidéo dans son ensemble : dégradé NOIR directionnel
          (gauche opaque -> droite transparente), pas le dégradé de marque plein cadre d'origine
          (from-ca/80 to-cad/85), qui couvrait quasi entièrement la vidéo d'un aplat rouge opaque
          au lieu de la laisser transparaître (bug rapporté par l'utilisateur le 2026-09-27 :
          "je ne vois qu'un rectangle rouge"). */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/25 to-transparent" />
    </>
  );
}
