/**
 * Aperçu Google Maps réutilisable (demande utilisateur du 2026-09-27, points 11.2 "Maps-Link für
 * den Ort + Vorschau + Adresse anzeigen" et 12.1 "Maps-Link für Treffpunkt + Adresse anzeigen").
 *
 * Décision de conception : le lien Maps saisi par l'admin (souvent un lien court `share.google/...`
 * ou un lien "partager" Google Maps) est fréquemment BLOQUÉ par Google pour l'intégration en
 * iframe (X-Frame-Options / robots), ce qui a été confirmé en pratique lors de cette même session
 * (WebFetch refusé deux fois sur un tel lien). Plutôt que de tenter d'iframer ce lien arbitraire
 * (fragile, casse silencieusement selon le lien fourni), on découple :
 *  - la VIGNETTE d'aperçu est générée depuis le TEXTE de l'adresse via le point d'intégration
 *    Google Maps sans clé API (`https://www.google.com/maps?q=<adresse>&output=embed`), qui
 *    fonctionne de façon fiable pour n'importe quelle adresse texte ;
 *  - le lien cliquable ("Ouvrir dans Google Maps") pointe vers l'URL Maps fournie par l'admin
 *    telle quelle, pour ouvrir l'app/le site Maps avec l'éventuel point exact/partagé.
 */
import { IconExternalLink, IconMapPin } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

import { sicherUrl } from "../../utils/sicherUrl";

export interface MapsApercuProps {
  /** Adresse texte affichée et utilisée pour générer la vignette d'aperçu. */
  adresse: string;
  /** URL Google Maps fournie par l'admin (lien "partager", éventuellement un lien court) — utilisée
   * uniquement comme cible du lien cliquable, jamais pour l'iframe (voir docstring ci-dessus). */
  mapsUrl?: string | null;
  className?: string;
}

export default function MapsApercu({ adresse, mapsUrl, className = "" }: MapsApercuProps) {
  const { t } = useTranslation("common");

  if (!adresse.trim()) return null;
  const ziel = sicherUrl(mapsUrl);

  return (
    <div className={`space-y-2 ${className}`}>
      <p className="flex items-start gap-1.5 text-sm text-text-secondary">
        <IconMapPin size={16} className="mt-0.5 shrink-0" />
        <span>{adresse}</span>
      </p>
      <iframe
        title={adresse}
        src={`https://www.google.com/maps?q=${encodeURIComponent(adresse)}&output=embed`}
        className="h-40 w-full rounded-cid border-0"
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
      />
      {ziel && (
        <a
          href={ziel}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-ca hover:underline"
        >
          {t("maps.ouvrir")}
          <IconExternalLink size={13} />
        </a>
      )}
    </div>
  );
}
