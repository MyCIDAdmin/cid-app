import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Link from "@tiptap/extension-link";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";

import { creerSuggestionMention } from "./mentionSuggestion";
import type { MentionSuggestionItem } from "./MentionSuggestionListe";

interface RichTextEditorProps {
  /** HTML contrôlé depuis l'extérieur (ex. Projet.description_html) — voir useEffect
   * ci-dessous pour la resynchronisation quand `value` change hors de l'éditeur lui-même
   * (ex. chargement asynchrone d'un projet existant en édition). */
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Lecture seule — utilisé pour un aperçu, jamais pour l'affichage final d'un projet (qui
   * rend `description_html` directement, sans repasser par TipTap, voir ProjetPage). */
  readOnly?: boolean;
  ariaLabel?: string;
  /** Active les mentions "@" (ajouté le 2026-09-29) — omis par défaut, donc sans effet sur
   * apps.projets (seul autre consommateur de ce composant). Quand fourni, tape "@" ouvre un
   * popup de suggestions (voir mentionSuggestion.ts) et insère un nœud dont le HTML final
   * porte `data-id` — extrait côté backend par apps.communaute.models.extraire_mentions. */
  rechercherMentions?: (query: string) => Promise<MentionSuggestionItem[]>;
}

/**
 * Éditeur de texte riche type Word (module Projets & Actions, demande utilisateur point 1.2 :
 * "Die Erfassung des Textes muss in einem Microsoft Word-like text editor möglich sein") —
 * TipTap/ProseMirror, seule bibliothèque d'édition riche du projet (aucune autre installée,
 * voir package.json). Produit du HTML stocké tel quel côté serveur
 * (Projet.description_html/ProjetMiseAJour.contenu_html) — pas de sanitization HTML côté
 * serveur dans cette première version (voir docstring de module apps.projets.models), ce champ
 * n'est donc rempli QUE par des rôles habilités (Bureau Admin+/responsable de projet, jamais un
 * membre normal) — voir ProjetPermission/GestionContenuProjetPermission côté backend.
 */
export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  readOnly = false,
  ariaLabel,
  rechercherMentions,
}: RichTextEditorProps) {
  const { t } = useTranslation("common");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      ...(rechercherMentions
        ? [Mention.configure({ suggestion: creerSuggestionMention(rechercherMentions) })]
        : []),
    ],
    content: value,
    editable: !readOnly,
    onUpdate: ({ editor: instance }) => {
      onChange(instance.getHTML());
    },
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
        class:
          "prose prose-sm max-w-none min-h-[10rem] px-3 py-2 text-text-primary focus:outline-none " +
          "[&_a]:text-ca [&_a]:underline " +
          "[&_span[data-type='mention']]:font-semibold [&_span[data-type='mention']]:text-ca " +
          "[&_p.is-editor-empty:first-child::before]:text-text-tertiary " +
          "[&_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] " +
          "[&_p.is-editor-empty:first-child::before]:float-left " +
          "[&_p.is-editor-empty:first-child::before]:pointer-events-none [&_p.is-editor-empty:first-child::before]:h-0",
      },
    },
  });

  // Resynchronise l'éditeur quand `value` change depuis l'extérieur (ex. les données d'un
  // projet existant arrivent après le premier rendu, en édition) — jamais sur chaque frappe :
  // comparer au HTML déjà tenu par l'éditeur évite de réinitialiser le curseur pendant que
  // l'utilisateur tape (onUpdate ci-dessus fait déjà remonter chaque changement local).
  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value, false);
    }
  }, [editor, value]);

  if (!editor) return null;

  const boutonClasse = (actif: boolean) =>
    `rounded-cid px-2 py-1 text-sm ${
      actif ? "bg-ca text-white" : "text-text-secondary hover:bg-bg-tertiary"
    }`;

  return (
    <div className="rounded-cid border border-text-tertiary/30 bg-bg-primary">
      {!readOnly && (
        <div
          role="toolbar"
          aria-label={t("editeur.barre_outils") ?? ""}
          className="flex flex-wrap items-center gap-1 border-b border-text-tertiary/20 p-1.5"
        >
          <button
            type="button"
            title={t("editeur.gras") ?? ""}
            aria-label={t("editeur.gras") ?? ""}
            aria-pressed={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`${boutonClasse(editor.isActive("bold"))} font-bold`}
          >
            G
          </button>
          <button
            type="button"
            title={t("editeur.italique") ?? ""}
            aria-label={t("editeur.italique") ?? ""}
            aria-pressed={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`${boutonClasse(editor.isActive("italic"))} italic`}
          >
            I
          </button>
          <button
            type="button"
            title={t("editeur.souligne") ?? ""}
            aria-label={t("editeur.souligne") ?? ""}
            aria-pressed={editor.isActive("underline")}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`${boutonClasse(editor.isActive("underline"))} underline`}
          >
            S
          </button>
          <span className="mx-1 h-5 w-px bg-text-tertiary/20" aria-hidden="true" />
          <button
            type="button"
            title={t("editeur.titre_2") ?? ""}
            aria-label={t("editeur.titre_2") ?? ""}
            aria-pressed={editor.isActive("heading", { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={boutonClasse(editor.isActive("heading", { level: 2 }))}
          >
            H2
          </button>
          <button
            type="button"
            title={t("editeur.titre_3") ?? ""}
            aria-label={t("editeur.titre_3") ?? ""}
            aria-pressed={editor.isActive("heading", { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={boutonClasse(editor.isActive("heading", { level: 3 }))}
          >
            H3
          </button>
          <span className="mx-1 h-5 w-px bg-text-tertiary/20" aria-hidden="true" />
          <button
            type="button"
            title={t("editeur.liste_puces") ?? ""}
            aria-label={t("editeur.liste_puces") ?? ""}
            aria-pressed={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={boutonClasse(editor.isActive("bulletList"))}
          >
            •—
          </button>
          <button
            type="button"
            title={t("editeur.liste_numerotee") ?? ""}
            aria-label={t("editeur.liste_numerotee") ?? ""}
            aria-pressed={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={boutonClasse(editor.isActive("orderedList"))}
          >
            1.—
          </button>
          <span className="mx-1 h-5 w-px bg-text-tertiary/20" aria-hidden="true" />
          <button
            type="button"
            title={t("editeur.aligner_gauche") ?? ""}
            aria-label={t("editeur.aligner_gauche") ?? ""}
            aria-pressed={editor.isActive({ textAlign: "left" })}
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
            className={boutonClasse(editor.isActive({ textAlign: "left" }))}
          >
            ≡◀
          </button>
          <button
            type="button"
            title={t("editeur.centrer") ?? ""}
            aria-label={t("editeur.centrer") ?? ""}
            aria-pressed={editor.isActive({ textAlign: "center" })}
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
            className={boutonClasse(editor.isActive({ textAlign: "center" }))}
          >
            ≡
          </button>
          <button
            type="button"
            title={t("editeur.aligner_droite") ?? ""}
            aria-label={t("editeur.aligner_droite") ?? ""}
            aria-pressed={editor.isActive({ textAlign: "right" })}
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
            className={boutonClasse(editor.isActive({ textAlign: "right" }))}
          >
            ≡▶
          </button>
          <span className="mx-1 h-5 w-px bg-text-tertiary/20" aria-hidden="true" />
          <button
            type="button"
            title={t("editeur.lien") ?? ""}
            aria-label={t("editeur.lien") ?? ""}
            aria-pressed={editor.isActive("link")}
            onClick={() => {
              const url = window.prompt(t("editeur.lien_url") ?? "");
              if (url === null) return;
              if (url === "") {
                editor.chain().focus().unsetLink().run();
              } else {
                editor.chain().focus().setLink({ href: url }).run();
              }
            }}
            className={boutonClasse(editor.isActive("link"))}
          >
            🔗
          </button>
          <span className="ml-auto flex gap-1">
            <button
              type="button"
              title={t("editeur.annuler_saisie") ?? ""}
              aria-label={t("editeur.annuler_saisie") ?? ""}
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().undo()}
              className={`${boutonClasse(false)} disabled:opacity-30`}
            >
              ↶
            </button>
            <button
              type="button"
              title={t("editeur.retablir_saisie") ?? ""}
              aria-label={t("editeur.retablir_saisie") ?? ""}
              onClick={() => editor.chain().focus().redo().run()}
              disabled={!editor.can().redo()}
              className={`${boutonClasse(false)} disabled:opacity-30`}
            >
              ↷
            </button>
          </span>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
