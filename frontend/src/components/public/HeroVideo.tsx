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
export default function HeroVideo({ videoUrl }: { videoUrl: string }) {
  return (
    <>
      <video
        key={videoUrl}
        src={videoUrl}
        autoPlay
        muted
        loop
        playsInline
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
      />
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
