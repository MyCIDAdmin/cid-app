/**
 * "Beleg"-Button für die Zahlungslisten (Nutzerwunsch 2026-10-06 : "Zahlungsbelege wenn
 * vorhanden an den Listen anhängen") — lädt den PDF-Beleg über die übergebene Funktion und
 * löst den Download aus. Wird nur gerendert, wenn ein Beleg existiert (bezahlt/bestätigt).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { extractApiErrorMessage } from "../../utils/apiError";
import { declencherTelechargement } from "../../utils/telechargement";

interface BelegButtonProps {
  holen: () => Promise<Blob>;
  dateiname: string;
  label?: string;
}

export default function BelegButton({ holen, dateiname, label }: BelegButtonProps) {
  const { t } = useTranslation("cotisations");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function laden() {
    setFehler(null);
    setLaeuft(true);
    try {
      declencherTelechargement(await holen(), dateiname);
    } catch (error) {
      setFehler(extractApiErrorMessage(error, t("recu.erreur")));
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        onClick={laden}
        disabled={laeuft}
        className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs font-medium text-text-secondary hover:bg-bg-tertiary disabled:opacity-40"
      >
        📄 {laeuft ? t("recu.en_cours") : (label ?? t("recu.telecharger"))}
      </button>
      {fehler && <span className="mt-1 text-[11px] text-status-dangerText">{fehler}</span>}
    </span>
  );
}
