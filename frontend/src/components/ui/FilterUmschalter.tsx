import { IconFilter } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

interface Props {
  offen: boolean;
  onUmschalten: () => void;
  /** Anzahl aktiver Filter (Zähler am Knopf) ; 0 oder weglassen = keine Anzeige. */
  aktiv?: number;
  controls?: string;
}

/**
 * Knopf „Filter" für das Handy : Der Filterblock darunter ist dort eingeklappt und klappt per Knopf
 * auf (Klassen: `filterBlockKlasse` in utils/filter). Ab md (Tablet/Desktop) ist der Knopf unsichtbar und die Filter
 * stehen wie bisher immer offen.
 */
export default function FilterUmschalter({ offen, onUmschalten, aktiv = 0, controls }: Props) {
  const { t } = useTranslation("common");
  return (
    <button
      type="button"
      onClick={onUmschalten}
      aria-expanded={offen}
      aria-controls={controls}
      className="mb-3 flex w-full items-center justify-center gap-2 rounded-cid border border-text-tertiary/30 bg-bg-primary px-3 py-2 text-sm font-medium text-text-secondary hover:bg-bg-tertiary md:hidden"
    >
      <IconFilter size={16} aria-hidden="true" />
      {offen ? t("filter.schliessen") : t("filter.oeffnen")}
      {aktiv > 0 && (
        <span className="rounded-full bg-ca px-2 text-xs font-semibold text-white">{aktiv}</span>
      )}
    </button>
  );
}
