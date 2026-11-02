import { useTranslation } from "react-i18next";

import { PHASEN } from "../../types/wahlen";

/** Die sieben Phasen einer Wahl; die laufende ist hervorgehoben, frühere sind abgehakt. */
export default function PhasenLeiste({ phase }: { phase: number }) {
  const { t } = useTranslation("wahlen");
  return (
    <ol className="flex flex-wrap gap-1.5" aria-label={t("phasen_titel")} data-testid="phasen">
      {PHASEN.map((name, i) => {
        const stil =
          i < phase
            ? "bg-status-successBg text-status-successText"
            : i === phase
              ? "bg-ca text-white"
              : "bg-bg-secondary text-text-tertiary";
        return (
          <li
            key={name}
            aria-current={i === phase ? "step" : undefined}
            className={`rounded-full px-3 py-1 text-xs font-medium ${stil}`}
          >
            {i + 1}. {t(`phase.${name}`)}
          </li>
        );
      })}
    </ol>
  );
}
