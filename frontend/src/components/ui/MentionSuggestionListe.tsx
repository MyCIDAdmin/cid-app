/**
 * Popup de suggestions "@" pour RichTextEditor (extension @tiptap/extension-mention — ajouté
 * le 2026-09-29, demande utilisateur : "'@'-Erwähnungen auf weitere Module wie Forum/
 * Neuigkeiten ausweiten und mit echten Benachrichtigungen versehen"). Rendu par
 * mentionSuggestion.ts via ReactRenderer + tippy.js (déjà présent comme dépendance
 * transitive de @tiptap/react via extension-bubble-menu/extension-floating-menu, jamais
 * utilisées par cet éditeur — voir package.json), pour le positionnement flottant au niveau
 * du curseur (TipTap ne propose pas d'alternative "sans dépendance" pour ce positionnement
 * dynamique, contrairement au dropdown statique de GroupeChatPage.tsx/useMentionAutocomplete
 * qui se contente d'un `position: absolute` fixe en bas du champ).
 *
 * Navigation clavier (haut/bas/entrée) gérée ici via `onKeyDown`, exposée par ref à
 * mentionSuggestion.ts (TipTap intercepte les événements clavier de l'éditeur pendant que la
 * popup est ouverte et les relaie au composant plutôt que de les laisser atteindre l'éditeur).
 */
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";

export interface MentionSuggestionItem {
  id: string;
  label: string;
}

interface MentionSuggestionListeProps {
  items: MentionSuggestionItem[];
  command: (item: MentionSuggestionItem) => void;
}

export interface MentionSuggestionListeHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const MentionSuggestionListe = forwardRef<
  MentionSuggestionListeHandle,
  MentionSuggestionListeProps
>(({ items, command }, ref) => {
  const [index, setIndex] = useState(0);

  // L'index sélectionné doit revenir à 0 à chaque nouvelle recherche (liste `items`
  // remplacée), sans quoi une sélection au clavier pourrait pointer au-delà de la nouvelle
  // liste, plus courte.
  useEffect(() => setIndex(0), [items]);

  function choisir(i: number) {
    const item = items[i];
    if (item) command(item);
  }

  useImperativeHandle(ref, () => ({
    onKeyDown({ event }) {
      if (items.length === 0) return false;
      if (event.key === "ArrowDown") {
        setIndex((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        setIndex((i) => (i - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === "Enter") {
        choisir(index);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) return null;

  return (
    <div className="w-48 rounded-cid-lg bg-bg-primary py-1 shadow-xl">
      {items.map((item, i) => (
        <button
          key={item.id}
          type="button"
          onClick={() => choisir(i)}
          className={`block w-full px-3 py-1 text-left text-xs ${
            i === index ? "bg-bg-tertiary" : "hover:bg-bg-tertiary"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
});

MentionSuggestionListe.displayName = "MentionSuggestionListe";

export default MentionSuggestionListe;
