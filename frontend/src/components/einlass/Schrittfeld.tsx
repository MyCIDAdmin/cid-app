/** Plus/Minus-Feld für eine Personenzahl zwischen 0 und `max`. */
export default function Schrittfeld({
  label,
  wert,
  max,
  onChange,
}: {
  label: string;
  wert: number;
  max: number;
  onChange: (neu: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-text-primary">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`${label} −`}
          disabled={wert <= 0}
          onClick={() => onChange(wert - 1)}
          className="h-11 w-11 rounded-cid border border-text-tertiary/30 text-xl text-text-primary hover:bg-bg-tertiary disabled:opacity-40"
        >
          −
        </button>
        <span className="w-8 text-center text-lg font-semibold tabular-nums text-text-primary">
          {wert}
        </span>
        <button
          type="button"
          aria-label={`${label} +`}
          disabled={wert >= max}
          onClick={() => onChange(wert + 1)}
          className="h-11 w-11 rounded-cid border border-text-tertiary/30 text-xl text-text-primary hover:bg-bg-tertiary disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}
