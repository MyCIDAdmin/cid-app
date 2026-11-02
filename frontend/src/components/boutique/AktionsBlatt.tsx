/**
 * Kleines Bestätigungsfenster („Blatt") für eine einzelne Aktion der Shop-Verwaltung: nennt in
 * Alltagssprache, WAS passiert und was DANACH gilt, bevor etwas geschieht. Inhalt (z. B. Zahlart)
 * kommt als `children`. Schließt mit Escape und Klick daneben (wie alle Fenster der App).
 */
import { useTranslation } from "react-i18next";

import { EscapeSchliessen } from "../ui/EscapeSchliessen";
import { hintergrundKlick } from "../../hooks/useEscapeSchliessen";

export default function AktionsBlatt({
  titel,
  nummer,
  folge,
  knopf,
  onBestaetigen,
  onClose,
  deaktiviert = false,
  laeuft = false,
  fehler,
  gefahr = false,
  children,
}: {
  titel: string;
  nummer: string;
  /** Satz, der die Folge der Aktion beschreibt („Danach: …"). */
  folge: string;
  knopf: string;
  onBestaetigen: () => void;
  onClose: () => void;
  deaktiviert?: boolean;
  laeuft?: boolean;
  fehler?: string | null;
  gefahr?: boolean;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation("boutique");
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titel}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      {...hintergrundKlick(onClose)}
    >
      <EscapeSchliessen onClose={onClose} />
      <div className="w-full max-w-sm rounded-cid-lg bg-bg-primary p-5 shadow-xl">
        <h2 className="text-base font-semibold text-text-primary">{titel}</h2>
        <p className="mt-1 text-xs text-text-tertiary">{nummer}</p>
        {children && <div className="mt-3 flex flex-col gap-2">{children}</div>}
        <p
          role="note"
          className="mt-3 rounded-cid bg-status-infoBg px-3 py-2 text-xs text-status-infoText"
        >
          {folge}
        </p>
        {fehler && <p className="mt-2 text-xs text-status-dangerText">{fehler}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary"
          >
            {t("modal_annuler")}
          </button>
          <button
            type="button"
            onClick={onBestaetigen}
            disabled={deaktiviert || laeuft}
            className={`rounded-cid px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 ${
              gefahr ? "bg-status-dangerText" : "bg-ca hover:bg-cad"
            }`}
          >
            {knopf}
          </button>
        </div>
      </div>
    </div>
  );
}
