/** Personen suchen und auswählen (Chips), einzeln oder mehrere — für Terminfindung und Sitzung. */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { usePersonenSuche } from "../../hooks/useKalender";
import type { Person } from "../../types/kalender";

interface Props {
  gewaehlt: Person[];
  onChange: (neu: Person[]) => void;
  /** Höchstens eine Person (ersetzt die Auswahl). */
  einzeln?: boolean;
  platzhalter?: string;
}

const FELD = "w-full rounded-cid border border-text-tertiary/30 bg-bg-primary px-2 py-1.5 text-sm";

export default function PersonenWahl({ gewaehlt, onChange, einzeln, platzhalter }: Props) {
  const { t } = useTranslation("kalender");
  const [suche, setSuche] = useState("");
  const treffer = usePersonenSuche(suche);
  const vorschlaege = (treffer.data ?? []).filter((p) => !gewaehlt.some((x) => x.user === p.user));

  return (
    <div>
      {gewaehlt.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1">
          {gewaehlt.map((p) => (
            <li key={p.user}>
              <button
                type="button"
                aria-label={t("form.entfernen", { name: p.name })}
                onClick={() => onChange(gewaehlt.filter((x) => x.user !== p.user))}
                className="rounded-full bg-bg-tertiary px-2 py-0.5 text-xs text-text-primary"
              >
                {p.name} ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {!(einzeln && gewaehlt.length > 0) && (
        <input
          className={FELD}
          value={suche}
          placeholder={platzhalter ?? t("form.person_suchen")}
          onChange={(e) => setSuche(e.target.value)}
        />
      )}
      {suche.trim().length >= 2 && vorschlaege.length > 0 && (
        <ul className="mt-1 rounded-cid border border-text-tertiary/20">
          {vorschlaege.map((p) => (
            <li key={p.user}>
              <button
                type="button"
                className="block w-full px-2 py-1 text-start text-sm hover:bg-bg-secondary"
                onClick={() => {
                  onChange(einzeln ? [p] : [...gewaehlt, p]);
                  setSuche("");
                }}
              >
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
