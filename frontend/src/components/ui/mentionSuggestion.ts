/**
 * Config de suggestion "@" pour @tiptap/extension-mention (voir RichTextEditor.tsx pour le
 * point d'activation, et MentionSuggestionListe.tsx pour le rendu du popup — ajouté le
 * 2026-09-29, demande utilisateur : "'@'-Erwähnungen auf weitere Module wie Forum/Neuigkeiten
 * ausweiten und mit echten Benachrichtigungen versehen").
 *
 * Générique (aucune dépendance sur apps/communaute) : `rechercher` est fourni par l'appelant
 * (voir FilPage.tsx, seul composeur TipTap du module communaute — RichTextEditor reste
 * réutilisé tel quel par apps.projets, qui n'active pas cette option).
 */
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions } from "@tiptap/suggestion";
import tippy, { type Instance as TippyInstance } from "tippy.js";

import MentionSuggestionListe, {
  type MentionSuggestionItem,
  type MentionSuggestionListeHandle,
} from "./MentionSuggestionListe";

const MAX_SUGGESTIONS = 5;

export function creerSuggestionMention(
  rechercher: (query: string) => Promise<MentionSuggestionItem[]>,
): Omit<SuggestionOptions<MentionSuggestionItem>, "editor"> {
  return {
    items: async ({ query }) => (await rechercher(query)).slice(0, MAX_SUGGESTIONS),

    render: () => {
      let composant: ReactRenderer<MentionSuggestionListeHandle>;
      let popup: TippyInstance[];

      return {
        onStart: (props) => {
          composant = new ReactRenderer(MentionSuggestionListe, {
            props,
            editor: props.editor,
          });
          if (!props.clientRect) return;
          popup = tippy("body", {
            getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect(),
            appendTo: () => document.body,
            content: composant.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
          });
        },
        onUpdate(props) {
          composant.updateProps(props);
          if (!props.clientRect) return;
          popup[0]?.setProps({
            getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect(),
          });
        },
        onKeyDown(props) {
          if (props.event.key === "Escape") {
            popup[0]?.hide();
            return true;
          }
          return composant.ref?.onKeyDown(props) ?? false;
        },
        onExit() {
          popup[0]?.destroy();
          composant.destroy();
        },
      };
    },
  };
}
