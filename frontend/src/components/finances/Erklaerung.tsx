/** Bausteine der Erklär-Ebene: „Einfach erklärt“-Hinweis, Fachwort mit Kurzerklärung und der
 * Schalter dafür. Alle Texte stehen in `finances.json` unter `glossar`. */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useEinfachModus } from "../../hooks/useEinfachModus";

export type Begriff =
  | "vier"
  | "abschluss"
  | "probelauf"
  | "ergebnis"
  | "budget"
  | "beleg"
  | "pruefung"
  | "entlastung"
  | "kosten";

export function EinfachSchalter() {
  const { t } = useTranslation("finances");
  const [an, setAn] = useEinfachModus();
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-text-secondary">
      <input type="checkbox" checked={an} onChange={(e) => setAn(e.target.checked)} />
      {t("glossar.schalter")}
    </label>
  );
}

/** Blauer Hinweis, nur sichtbar bei eingeschaltetem Erklär-Modus. */
export function HilfeHinweis({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation("finances");
  const [an] = useEinfachModus();
  if (!an) return null;
  return (
    <p
      role="note"
      className="mt-2 rounded-cid bg-status-infoBg px-3 py-2 text-xs text-status-infoText"
    >
      <span className="font-semibold">{t("glossar.einfach")} </span>
      {children}
    </p>
  );
}

/** Unterstrichenes Fachwort: Klick zeigt die Erklärung direkt darunter. */
export function Fachwort({ begriff }: { begriff: Begriff }) {
  const { t } = useTranslation("finances");
  const [offen, setOffen] = useState(false);
  const [an] = useEinfachModus();
  const titel = t(`glossar.begriffe.${begriff}.titel`);
  if (!an) return <>{titel}</>;
  return (
    <>
      <button
        type="button"
        aria-expanded={offen}
        onClick={() => setOffen((o) => !o)}
        className="cursor-help underline decoration-dotted underline-offset-2 hover:text-ca"
      >
        {titel}
      </button>
      {offen && (
        <span
          role="note"
          className="my-1 block rounded-cid bg-status-infoBg px-3 py-2 text-xs font-normal text-status-infoText"
        >
          {t(`glossar.begriffe.${begriff}.text`)}
        </span>
      )}
    </>
  );
}
