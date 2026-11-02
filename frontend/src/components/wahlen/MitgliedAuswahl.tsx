import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useRechercherMembres } from "../../hooks/useCommunaute";
import type { Auteur } from "../../types/communaute";

interface Props {
  onWahl: (membre: Auteur) => void;
  /** Mitglieder, die nicht mehr angeboten werden sollen (schon gewählt). */
  ausgeschlossen?: string[];
  ariaLabel: string;
}

/** Suchfeld mit Trefferliste (Name/Vorname) über den schlanken Mitgliederverzeichnis-Endpunkt. */
export default function MitgliedAuswahl({ onWahl, ausgeschlossen = [], ariaLabel }: Props) {
  const { t } = useTranslation("wahlen");
  const [suche, setSuche] = useState("");
  const treffer = useRechercherMembres(suche.trim(), suche.trim().length >= 2);
  const liste = (treffer.data ?? []).filter((m) => !ausgeschlossen.includes(m.id)).slice(0, 6);

  return (
    <div>
      <input
        type="search"
        value={suche}
        onChange={(e) => setSuche(e.target.value)}
        placeholder={t("auswahl.suchen")}
        aria-label={ariaLabel}
        className="w-full rounded-cid border border-text-tertiary/30 p-2 text-sm"
      />
      {suche.trim().length >= 2 && (
        <ul className="mt-1 divide-y divide-text-tertiary/10 rounded-cid border border-text-tertiary/20 bg-bg-primary">
          {liste.length === 0 && (
            <li className="p-2 text-xs text-text-tertiary">{t("auswahl.keine_treffer")}</li>
          )}
          {liste.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => {
                  onWahl(m);
                  setSuche("");
                }}
                className="w-full p-2 text-left text-sm hover:bg-bg-secondary"
              >
                {m.prenom} {m.nom}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
