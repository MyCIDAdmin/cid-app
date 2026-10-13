/** Umschalter „Quiz | Umfragen“ (Release 11), gemeinsam für Mitglieder- und Verwaltungsseite. */
import { useTranslation } from "react-i18next";

export type QuizBereich = "quiz" | "umfragen";

export default function QuizUmfragenTabs({
  aktiv,
  onWechsel,
}: {
  aktiv: QuizBereich;
  onWechsel: (bereich: QuizBereich) => void;
}) {
  const { t } = useTranslation("umfragen");
  return (
    <div role="tablist" className="mb-4 flex gap-1 border-b border-text-tertiary/20">
      {(["quiz", "umfragen"] as const).map((bereich) => (
        <button
          key={bereich}
          type="button"
          role="tab"
          aria-selected={aktiv === bereich}
          onClick={() => onWechsel(bereich)}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
            aktiv === bereich
              ? "border-ca text-ca"
              : "border-transparent text-text-secondary hover:text-text-primary"
          }`}
        >
          {t(`tab.${bereich}`)}
        </button>
      ))}
    </div>
  );
}
