/**
 * Recherche + sélection d'UN membre par nom/prénom/numéro de membre (ajouté le 2026-09-21 pour
 * la saisie d'un paiement en espèces sur CotisationsEnAttentePage — voir sa docstring). Reprend
 * le principe déjà utilisé en ligne dans CreerVoteWizardPage (champ de recherche +
 * useMembresList({ q }) + liste déroulante), extrait ici en composant réutilisable puisque c'est
 * désormais le 2e endroit qui en a besoin. Ne gère qu'une sélection unique (contrairement au
 * multi-sélection à cases à cocher du wizard de vote) : un paiement en espèces cible un seul
 * membre.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useMembresList } from "../../hooks/useMembres";
import type { MembreListItem } from "../../types/membre";

interface MembreSearchPickerProps {
  selection: MembreListItem | null;
  onSelect: (membre: MembreListItem) => void;
  placeholder?: string;
}

export default function MembreSearchPicker({
  selection,
  onSelect,
  placeholder,
}: MembreSearchPickerProps) {
  const { t } = useTranslation("common");
  const [recherche, setRecherche] = useState("");

  // N'interroge le backend qu'à partir de 2 caractères — évite de renvoyer les ~300 fiches de
  // l'association à chaque frappe sur un champ vide (même seuil que d'autres recherches membre
  // du projet, ex. GroupesPage).
  const membresQuery = useMembresList({ q: recherche }, null, { enabled: recherche.length >= 2 });

  if (selection) {
    return (
      <div className="flex items-center gap-2 rounded-cid border border-text-tertiary/30 bg-bg-secondary px-2 py-1.5 text-sm">
        <span className="flex-1 truncate">
          {selection.prenom} {selection.nom} ({selection.numero_membre})
        </span>
        <button
          type="button"
          onClick={() => {
            setRecherche("");
            onSelect(null as unknown as MembreListItem);
          }}
          className="text-xs font-medium text-ca underline"
        >
          {t("action.changer")}
        </button>
      </div>
    );
  }

  return (
    <div>
      <input
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
      />
      {recherche.length >= 2 && (
        <div className="mt-1 max-h-40 overflow-y-auto rounded-cid border border-text-tertiary/20 bg-bg-primary shadow-sm">
          {membresQuery.isLoading && (
            <p className="px-2 py-1.5 text-xs text-text-tertiary">{t("chargement")}</p>
          )}
          {membresQuery.data?.results.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-text-tertiary">{t("aucun_resultat")}</p>
          )}
          {membresQuery.data?.results.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelect(m)}
              className="block w-full px-2 py-1.5 text-left text-sm hover:bg-bg-tertiary"
            >
              {m.prenom} {m.nom} ({m.numero_membre})
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
