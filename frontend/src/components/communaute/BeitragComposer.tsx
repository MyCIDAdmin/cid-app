/**
 * Beitragsfeld der Neuigkeiten (nur Bureau Admin+, siehe PublicationPermission im Backend).
 * Eingeklappt eine einzige Zeile – der große Editor nahm vorher die halbe Bildschirmhöhe ein ;
 * beim Antippen klappt er auf (Foto/PDF, „Wichtig“).
 */
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import * as communauteApi from "../../api/communaute";
import { useCreerPublication } from "../../hooks/useCommunaute";
import { extractApiErrorMessage } from "../../utils/apiError";
import { texteBrutDepuisHtml } from "../../utils/html";
import RichTextEditor from "../ui/RichTextEditor";

export default function BeitragComposer() {
  const { t } = useTranslation("communaute");
  const [offen, setOffen] = useState(false);
  const [texte, setTexte] = useState("");
  // Un seul sélecteur de fichier (accept="image/*,application/pdf") — le fichier est routé vers
  // `image` ou `document` selon son type MIME (retour utilisateur du 2026-09-20).
  const [fichier, setFichier] = useState<File | undefined>(undefined);
  const [important, setImportant] = useState(false);
  const [erreur, setErreur] = useState("");
  const creer = useCreerPublication();

  // Mentions "@" dans l'éditeur TipTap — voir components/ui/mentionSuggestion.ts.
  const rechercherMentions = useCallback(
    (query: string) =>
      communauteApi
        .rechercherMembres(query)
        .then((membres) => membres.map((m) => ({ id: m.id, label: `${m.prenom} ${m.nom}` }))),
    [],
  );

  function soumettre(e: React.FormEvent) {
    e.preventDefault();
    if (!texteBrutDepuisHtml(texte)) return;
    const estPdf = fichier?.type === "application/pdf";
    creer.mutate(
      {
        contenu: texte,
        image: fichier && !estPdf ? fichier : undefined,
        document: estPdf ? fichier : undefined,
        important,
      },
      {
        onSuccess: () => {
          setTexte("");
          setFichier(undefined);
          setImportant(false);
          setErreur("");
          setOffen(false);
        },
        onError: (err) => setErreur(extractApiErrorMessage(err, t("fil.erreur_publication"))),
      },
    );
  }

  if (!offen) {
    return (
      <button
        type="button"
        onClick={() => setOffen(true)}
        className="mb-4 flex w-full items-center gap-3 rounded-cid-lg bg-bg-primary p-3 text-left shadow-sm hover:bg-bg-secondary"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ca text-lg text-white">
          ✎
        </span>
        <span className="flex-1 rounded-full border border-text-tertiary/25 px-4 py-2 text-sm text-text-tertiary">
          {t("fil.composer_zeile")}
        </span>
      </button>
    );
  }

  return (
    <form
      onSubmit={soumettre}
      className="mb-4 rounded-cid-lg bg-bg-primary p-3 shadow-sm"
      id="new-post-form"
    >
      <RichTextEditor
        value={texte}
        onChange={setTexte}
        placeholder={t("fil.placeholder_publication")}
        ariaLabel={t("fil.placeholder_publication")}
        rechercherMentions={rechercherMentions}
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {/* Le <input type="file"> natif affiche son libellé dans la langue du NAVIGATEUR — on
              le masque (sr-only, reste focusable) et on ouvre le sélecteur via un <label> qui
              porte notre propre texte traduit (rapport MyCID du 2026-09-25). */}
          <label
            htmlFor="fil-fichier-input"
            className="flex-none cursor-pointer whitespace-nowrap rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs font-medium text-text-secondary hover:bg-bg-secondary"
          >
            {t("fil.joindre_fichier")}
          </label>
          <input
            id="fil-fichier-input"
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setFichier(e.target.files?.[0])}
            className="sr-only"
          />
          {fichier && (
            <span className="min-w-0 truncate text-xs text-text-tertiary" title={fichier.name}>
              {fichier.name}
            </span>
          )}
        </div>
        <label className="flex flex-none items-center gap-1 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={important}
            onChange={(e) => setImportant(e.target.checked)}
          />
          {t("fil.marquer_important")}
        </label>
        <div className="flex flex-none gap-2">
          <button
            type="button"
            onClick={() => setOffen(false)}
            className="rounded-cid px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-secondary"
          >
            {t("fil.abbrechen")}
          </button>
          <button
            type="submit"
            disabled={creer.isPending}
            className="rounded-cid bg-ca px-4 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
          >
            {t("fil.publier")}
          </button>
        </div>
      </div>
      <p className="mt-1 text-[10px] text-text-tertiary">{t("fil.types_autorises")}</p>
      {erreur && <p className="mt-1 text-xs text-status-dangerText">{erreur}</p>}
    </form>
  );
}
