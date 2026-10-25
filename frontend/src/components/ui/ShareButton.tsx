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
 * Mise à jour du 2026-10-25 (demande utilisateur : "Beim Teilen soll es überall wo es geteilt
 * wird in der App möglich sein, den Text (Beschreibung) des Posts vor dem Teilen zu ergänzen") :
 * le clic n'envoie plus rien directement, il ouvre une fenêtre avec le texte proposé dans un champ
 * modifiable (`texte` ou texte par défaut), le lien partagé en lecture seule, puis les canaux
 * (feuille native si disponible, WhatsApp, Facebook, X, e-mail, copie). Le texte saisi est
 * transmis tel quel à chaque canal. Comme tous les partages externes de l'app passent par ce
 * composant, la modification s'applique partout.
 *
 * Web Share API (`navigator.share`) en priorité — ouvre la feuille de partage native du système
 * (mobile surtout) ; à défaut (desktop hors navigateurs compatibles), menu déroulant de secours
 * avec les réseaux les plus utilisés par l'association + copie du lien, même principe de
 * fermeture au clic extérieur que NotificationBell.tsx.
 */
import { useState } from "react";
import { createPortal } from "react-dom";
import {
  IconBrandFacebook,
  IconBrandWhatsapp,
  IconBrandX,
  IconCheck,
  IconCopy,
  IconMail,
  IconShare3,
  IconX,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { hintergrundKlick, useEscapeSchliessen } from "../../hooks/useEscapeSchliessen";

export interface ShareButtonProps {
  /** Chemin relatif de l'app, ex. "/evenements?evenement=abc-123". */
  path: string;
  /** Vollständige Adresse, die geteilt wird (z. B. Vorschauseite einer Beitragsaktion). Ersetzt
   * dann die aus `path` gebildete Adresse. */
  url?: string;
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
  url: absoluteUrl,
  titre,
  texte,
  variant = "default",
  className = "",
}: ShareButtonProps) {
  const { t } = useTranslation("common");
  const [ouvert, setOuvert] = useState(false);
  const [lienCopie, setLienCopie] = useState(false);
  const [texteCopie, setTexteCopie] = useState(false);

  const url = absoluteUrl ?? `${window.location.origin}${path}`;
  const texteVorschlag = texte ?? t("partage.texte_partage", { titre });
  const [texteMessage, setTexteMessage] = useState(texteVorschlag);

  useEscapeSchliessen(() => setOuvert(false), ouvert);

  function oeffnen(e: React.MouseEvent) {
    e.stopPropagation();
    // Bei jedem Öffnen wieder der aktuelle Vorschlag (der Beitrag kann sich geändert haben).
    setTexteMessage(texteVorschlag);
    setLienCopie(false);
    setTexteCopie(false);
    setOuvert(true);
  }

  async function systemTeilen() {
    try {
      await navigator.share({ title: titre, text: texteMessage, url });
      setOuvert(false);
    } catch {
      // AbortError si l'utilisateur annule la feuille de partage native — la fenêtre reste ouverte.
    }
  }

  async function kopieren(inhalt: string, danach: (b: boolean) => void) {
    try {
      await navigator.clipboard.writeText(inhalt);
      danach(true);
      window.setTimeout(() => danach(false), 2000);
    } catch {
      // Presse-papier indisponible (contexte non sécurisé/permission refusée) — pas d'action de
      // repli : les autres canaux de la fenêtre restent utilisables.
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
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(texteMessage)}`,
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

  const kanal =
    "flex items-center gap-2 rounded-cid border border-text-tertiary/20 px-3 py-2 text-left text-xs text-text-secondary hover:bg-bg-tertiary";

  const dialog = ouvert
    ? createPortal(
        // Das Fenster hängt an <body>, React-Ereignisse laufen aber durch den Komponentenbaum nach
        // oben : Klicks dürfen keine umgebende Karte (Link, Auswahl) auslösen.
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(e) => {
            e.stopPropagation();
            hintergrundKlick(() => setOuvert(false)).onMouseDown(e);
          }}
          onClick={(e) => {
            e.stopPropagation();
            hintergrundKlick(() => setOuvert(false)).onClick(e);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("partage.dialog_titel")}
            className="w-full max-w-md rounded-cid-lg bg-bg-primary p-4 shadow-lg"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-text-primary">{t("partage.dialog_titel")}</h2>
              <button
                type="button"
                onClick={() => setOuvert(false)}
                aria-label={t("partage.schliessen")}
                className="text-text-tertiary hover:text-text-primary"
              >
                <IconX size={18} />
              </button>
            </div>

            <label
              htmlFor="partage-text"
              className="mb-1 block text-xs font-semibold uppercase text-text-tertiary"
            >
              {t("partage.text_label")}
            </label>
            <textarea
              id="partage-text"
              value={texteMessage}
              onChange={(e) => setTexteMessage(e.target.value)}
              rows={5}
              className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm text-text-primary"
            />
            <p className="mb-3 mt-1 break-all text-[11px] text-text-tertiary">
              {t("partage.link_label")}: {url}
            </p>

            <div className="grid grid-cols-2 gap-2">
              {typeof navigator.share === "function" && (
                <button
                  type="button"
                  onClick={systemTeilen}
                  className={`${kanal} col-span-2 font-semibold text-ca`}
                >
                  <IconShare3 size={15} />
                  {t("partage.system_teilen")}
                </button>
              )}
              {liens.map(({ cle, icone: Icone, href }) => (
                <a
                  key={cle}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOuvert(false)}
                  className={kanal}
                >
                  <Icone size={15} />
                  {t(`partage.${cle}`)}
                </a>
              ))}
              <button type="button" onClick={() => kopieren(url, setLienCopie)} className={kanal}>
                {lienCopie ? <IconCheck size={15} /> : <IconCopy size={15} />}
                {lienCopie ? t("partage.lien_copie") : t("partage.copier_lien")}
              </button>
              <button
                type="button"
                onClick={() => kopieren(`${texteMessage}\n${url}`, setTexteCopie)}
                className={kanal}
              >
                {texteCopie ? <IconCheck size={15} /> : <IconCopy size={15} />}
                {texteCopie ? t("partage.lien_copie") : t("partage.copier_text")}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={oeffnen}
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
      {dialog}
    </div>
  );
}
