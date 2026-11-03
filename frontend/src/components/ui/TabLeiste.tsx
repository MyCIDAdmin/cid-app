import { useEffect, useRef } from "react";

/**
 * Einfache Tab-Leiste (role="tablist"), z. B. Liste | Reporting. Bei vielen Reitern scrollt sie
 * auf schmalen Bildschirmen seitlich, statt die ganze Seite zu verbreitern.
 */
export interface TabEintrag {
  id: string;
  label: string;
}

interface Props {
  tabs: TabEintrag[];
  aktiv: string;
  onChange: (id: string) => void;
  ariaLabel: string;
}

export default function TabLeiste({ tabs, aktiv, onChange, ariaLabel }: Props) {
  const leiste = useRef<HTMLDivElement>(null);

  // Auf schmalen Bildschirmen scrollt die Leiste seitlich: den aktiven Reiter sichtbar halten
  // (auch bei Direktaufruf über ?tab=…).
  useEffect(() => {
    const box = leiste.current;
    const knopf = box?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!box || !knopf) return;
    const links = knopf.offsetLeft;
    const rechts = links + knopf.offsetWidth;
    if (links < box.scrollLeft) box.scrollLeft = links;
    else if (rechts > box.scrollLeft + box.clientWidth) box.scrollLeft = rechts - box.clientWidth;
  }, [aktiv]);

  return (
    <div
      ref={leiste}
      role="tablist"
      aria-label={ariaLabel}
      className="mb-4 flex gap-1 overflow-x-auto border-b border-text-tertiary/20 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((tab) => {
        const ausgewaehlt = tab.id === aktiv;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={ausgewaehlt}
            onClick={() => onChange(tab.id)}
            className={`shrink-0 whitespace-nowrap border-b-2 px-4 py-2 text-sm transition ${
              ausgewaehlt
                ? "border-ca font-semibold text-ca"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
