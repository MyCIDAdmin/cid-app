/**
 * Sélecteur d'emojis (demande utilisateur 2026-09-25, module "Nachrichten" & "Chatgruppen" :
 * "Editor durch chat editor mit emojis ersetzen") — bouton + grille d'emojis courants,
 * délibérément SANS bibliothèque npm (voir la réponse "Nur Emoji-Picker" à la question de
 * cadrage posée avant ce lot : le champ de saisie existant reste inchangé, ce composant se
 * contente d'insérer l'emoji choisi dans le texte).
 *
 * Grille curée plutôt qu'un jeu Unicode complet — largement suffisante pour une messagerie
 * associative et évite d'alourdir le bundle avec une table d'emojis exhaustive.
 *
 * Bug corrigé le 2026-09-25 (retour utilisateur, capture d'écran à l'appui : la grille
 * apparaissait partiellement recouverte par la sidebar) — MÊME CAUSE et MÊME correctif que
 * Sidebar.tsx::RailGroupButton (voir sa docstring, 2026-09-22) : la grille était positionnée
 * en `absolute` dans le flux normal de la page, donc rognée/recouverte par les ancêtres à
 * `overflow` non-`visible` sur le chemin jusqu'à `<main>` (AppLayout.tsx, `overflow-y-auto`)
 * — un `<aside>` statique (non positionné) peut alors se peindre PAR-DESSUS un descendant
 * positionné d'un ancêtre qui établit son propre contexte d'empilement. Corrigé de la même
 * façon : portail vers `document.body` avec des coordonnées `fixed` calculées depuis
 * `getBoundingClientRect()` du bouton, recalculées à chaque ouverture — s'affranchit de tout
 * ancêtre à `overflow`/contexte d'empilement limité, comme un menu de VS Code ou de Slack.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconMoodSmile } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

const EMOJIS = [
  "😀",
  "😂",
  "😍",
  "😎",
  "🤔",
  "😢",
  "😮",
  "😡",
  "👍",
  "👎",
  "👏",
  "🙏",
  "💪",
  "🔥",
  "🎉",
  "❤️",
  "⚽",
  "🏆",
  "🇹🇳",
  "☕",
  "😅",
  "🥳",
  "😴",
  "🤝",
];

export interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  className?: string;
}

export default function EmojiPicker({ onSelect, className = "" }: EmojiPickerProps) {
  const { t } = useTranslation("communaute");
  const [ouvert, setOuvert] = useState(false);
  // Coordonnées écran (voir docstring de tête) — recalculées à chaque ouverture : le bouton ne
  // bouge pas pendant qu'un menu portalé reste ouvert.
  const [position, setPosition] = useState<{ bottom: number; right: number } | null>(null);
  const boutonRef = useRef<HTMLButtonElement>(null);
  const grilleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouvert) return undefined;
    function handleClicExterieur(e: MouseEvent) {
      const cible = e.target as Node;
      // La grille vit désormais dans un portail (document.body), donc hors de l'arbre DOM du
      // bouton : un clic à l'intérieur de la grille doit aussi compter comme "à l'intérieur".
      if (boutonRef.current?.contains(cible) || grilleRef.current?.contains(cible)) return;
      setOuvert(false);
    }
    document.addEventListener("mousedown", handleClicExterieur);
    return () => document.removeEventListener("mousedown", handleClicExterieur);
  }, [ouvert]);

  function alterner(e: React.MouseEvent) {
    e.stopPropagation();
    if (!ouvert) {
      const rect = boutonRef.current?.getBoundingClientRect();
      if (rect) {
        setPosition({
          bottom: window.innerHeight - rect.top + 4,
          right: window.innerWidth - rect.right,
        });
      }
    }
    setOuvert((o) => !o);
  }

  return (
    <div className={`inline-block ${className}`}>
      <button
        ref={boutonRef}
        type="button"
        onClick={alterner}
        aria-label={t("emoji.bouton_aria")}
        title={t("emoji.bouton_aria")}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        className="flex h-9 w-9 items-center justify-center rounded-full text-text-tertiary hover:bg-bg-tertiary hover:text-ca"
      >
        <IconMoodSmile size={20} />
      </button>

      {ouvert &&
        position &&
        createPortal(
          <div
            ref={grilleRef}
            role="menu"
            style={{ bottom: position.bottom, right: position.right }}
            className="fixed z-30 grid w-56 grid-cols-6 gap-1 rounded-cid-lg bg-bg-primary p-2 shadow-xl"
          >
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(emoji);
                  setOuvert(false);
                }}
                className="flex h-8 w-8 items-center justify-center rounded text-lg hover:bg-bg-tertiary"
              >
                {emoji}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
