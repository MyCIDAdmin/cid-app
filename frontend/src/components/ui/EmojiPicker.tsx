/**
 * Sélecteur d'emojis (demande utilisateur 2026-09-25, module "Nachrichten" & "Chatgruppen" :
 * "Editor durch chat editor mit emojis ersetzen") — bouton + grille d'emojis courants,
 * délibérément SANS bibliothèque npm (voir la réponse "Nur Emoji-Picker" à la question de
 * cadrage posée avant ce lot : le champ de saisie existant reste inchangé, ce composant se
 * contente d'insérer l'emoji choisi dans le texte). Même principe d'ouverture/fermeture au
 * clic extérieur que ShareButton.tsx/NotificationBell.tsx.
 *
 * Grille curée plutôt qu'un jeu Unicode complet — largement suffisante pour une messagerie
 * associative et évite d'alourdir le bundle avec une table d'emojis exhaustive.
 */
import { useEffect, useRef, useState } from "react";
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

  return (
    <div ref={conteneurRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOuvert((o) => !o);
        }}
        aria-label={t("emoji.bouton_aria")}
        title={t("emoji.bouton_aria")}
        className="flex h-9 w-9 items-center justify-center rounded-full text-text-tertiary hover:bg-bg-tertiary hover:text-ca"
      >
        <IconMoodSmile size={20} />
      </button>

      {ouvert && (
        <div
          role="menu"
          className="absolute bottom-full right-0 z-20 mb-1 grid w-56 grid-cols-6 gap-1 rounded-cid-lg bg-bg-primary p-2 shadow-xl"
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
        </div>
      )}
    </div>
  );
}
