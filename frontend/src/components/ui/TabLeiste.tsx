/** Einfache Tab-Leiste (role="tablist") für Seiten mit zwei Ansichten, z. B. Liste | Reporting. */
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
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="mb-4 flex gap-1 border-b border-text-tertiary/20"
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
            className={`-mb-px border-b-2 px-4 py-2 text-sm transition ${
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
