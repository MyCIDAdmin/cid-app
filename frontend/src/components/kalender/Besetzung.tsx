import { useTranslation } from "react-i18next";

import type { Dienst } from "../../types/kalender";

export default function Besetzung({
  dienst,
}: {
  dienst: Pick<Dienst, "besetzt" | "benoetigt" | "frei">;
}) {
  const { t } = useTranslation("kalender");
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
        dienst.frei === 0
          ? "bg-status-successBg text-status-successText"
          : "bg-status-warningBg text-status-warningText"
      }`}
    >
      {t("dienste.besetzung", { besetzt: dienst.besetzt, benoetigt: dienst.benoetigt })}
    </span>
  );
}
