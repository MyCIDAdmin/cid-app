/**
 * Bouton de partage réseaux sociaux (ajouté le 2026-09-19, demande utilisateur : "Bei events,
 * Boutique, Fil d'actualité, Vote & elections und wo es Sinn macht in der lage sein die Elemente
 * zu teilen. Ein Icon um die Element in Social Media zu teilen").
 *
 * Volontairement DISTINCT du bouton "partager" (repost interne, voir
 * pages/communaute/FilPage.tsx/usePartagerPublication) : celui-là republie une publication dans
 * le fil de l'association elle-même (compteur `nombre_partages`), celui-ci ouvre le partage vers
 * l'EXTÉRIEUR (WhatsApp, Facebook, X, email, lien copié) — les deux peuvent légitimement
 * coexister sur une même carte.
 *
 * `path` est un chemin relatif de l'app (ex. `/evenements?evenement=<id>`, voir
 * hooks/useDeepLinkCible.ts) — l'URL absolue partagée est reconstruite à partir de
 * `window.location.origin`. Ces pages restent derrière `RequireAuth` (voir App.tsx) : un
 * destinataire non-membre devra se connecter pour la voir, ce qui reste cohérent avec un usage
 * de partage interne à l'association (un événement, un produit, une actualité... que des membres
 * partagent entre eux ou avec des sympathisants déjà en possession d'un compte).
 *
 * Web Share API (`navigator.share`) en priorité — ouvre la feuille de partage native du système
 * (mobile surtout) ; à défaut (desktop hors navigateurs compatibles), menu déroulant de secours
 * avec les réseaux les plus utilisés par l'association + copie du lien, même principe de
 * fermeture au clic extérieur que NotificationBell.tsx.
 */
import { useEffect, useRef, useState } from "react";
import {
  IconBrandFacebook,
  IconBrandWhatsapp,
  IconBrandX,
  IconCheck,
  IconCopy,
  IconMail,
  IconShare3,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

export interface ShareButtonProps {
  /** Chemin relatif de l'app, ex. "/evenements?evenement=abc-123". */
  path: string;
  /** Titre de l'élément partagé (utilisé par navigator.share et comme sujet d'email). */
  titre: string;
  /** Texte court complémentaire, optionnel (ex. date/lieu d'un événement). */
  texte?: string;
  /** "inverse" : icône claire, pour poser le bouton sur un fond de couleur (bandeau bg-ca...)
   * plutôt que sur une surface bg-bg-primary/secondary (défaut). */
  variant?: "default" | "inverse";
  className?: string;
}

export default function ShareButton({
  path,
  titre,
  texte,
  variant = "default",
  className = "",
}: ShareButtonProps) {
  const { t } = useTranslation("common");
  const [ouvert, setOuvert] = useState(false);
  const [lienCopie, setLienCopie] = useState(false);
  const conteneurRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClicExterieur(e: MouseEvent) {
      if (conteneurRef.current && !conteneurRef.current.contains(e.target as Node)) {
        setOuvert(false);
      }
    }
    if (ouvert) document.addEventListener("mousedown", handleClicExterieur);
    return () => document.removeEventListener("mousedown", handleClicExterieur);
  }, [ouvert]);

  const url = `${window.location.origin}${path}`;
  const texteMessage = texte ?? t("partage.texte_partage", { titre });

  async function handleClic(e: React.MouseEvent) {
    e.stopPropagation();
    if (navigator.share) {
      try {
        await navigator.share({ title: titre, text: texteMessage, url });
      } catch {
        // AbortError si l'utilisateur annule la feuille de partage native — rien à faire.
      }
      return;
    }
    setOuvert((o) => !o);
  }

  async function copierLien(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(url);
      setLienCopie(true);
      window.setTimeout(() => setLienCopie(false), 2000);
    } catch {
      // Presse-papier indisponible (contexte non sécurisé/permission refusée) — pas d'action de
      // repli : le lien reste visible dans les autres options du menu (WhatsApp, email...).
    }
  }

  const liens = [
    {
      cle: "whatsapp",
      icone: IconBrandWhatsapp,
      href: `https://wa.me/?text=${encodeURIComponent(`${texteMessage} ${url}`)}`,
    },
    {
      cle: "facebook",
      icone: IconBrandFacebook,
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    },
    {
      cle: "x",
      icone: IconBrandX,
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(texteMessage)}&url=${encodeURIComponent(url)}`,
    },
    {
      cle: "email",
      icone: IconMail,
      href: `mailto:?subject=${encodeURIComponent(titre)}&body=${encodeURIComponent(`${texteMessage}\n${url}`)}`,
    },
  ];

  return (
    <div ref={conteneurRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={handleClic}
        aria-label={t("partage.bouton_aria")}
        title={t("partage.bouton_aria")}
        className={`flex h-7 w-7 items-center justify-center rounded-full ${
          variant === "inverse"
            ? "text-white/80 hover:bg-white/15 hover:text-white"
            : "text-text-tertiary hover:bg-bg-tertiary hover:text-ca"
        }`}
      >
        <IconShare3 size={16} />
      </button>

      {ouvert && (
        <div className="absolute right-0 z-20 mt-1 w-44 rounded-cid-lg bg-bg-primary py-1 shadow-xl">
          {liens.map(({ cle, icone: Icone, href }) => (
            <a
              key={cle}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOuvert(false)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-tertiary"
            >
              <Icone size={15} />
              {t(`partage.${cle}`)}
            </a>
          ))}
          <button
            type="button"
            onClick={copierLien}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-bg-tertiary"
          >
            {lienCopie ? <IconCheck size={15} /> : <IconCopy size={15} />}
            {lienCopie ? t("partage.lien_copie") : t("partage.copier_lien")}
          </button>
        </div>
      )}
    </div>
  );
}
