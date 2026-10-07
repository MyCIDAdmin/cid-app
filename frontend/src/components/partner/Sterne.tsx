import { useTranslation } from "react-i18next";

/** Nur-Lese-Anzeige einer Note (0–5), gerundet auf ganze Sterne. */
export function Sterne({ wert, className = "" }: { wert: number | null; className?: string }) {
  const { t } = useTranslation("partner");
  if (wert === null) {
    return <span className="text-xs text-text-tertiary">{t("noch_keine_bewertung")}</span>;
  }
  const voll = Math.round(wert);
  return (
    <span
      className={`inline-flex items-center gap-1 ${className}`}
      aria-label={t("note_von_fuenf", { wert: wert.toFixed(1) })}
    >
      <span aria-hidden="true" className="tracking-tight text-amber-500">
        {"★".repeat(voll)}
        <span className="text-text-tertiary/40">{"★".repeat(5 - voll)}</span>
      </span>
      <span className="text-xs tabular-nums text-text-secondary">{wert.toFixed(1)}</span>
    </span>
  );
}

interface SterneEingabeProps {
  name: string;
  label: string;
  wert: number;
  onChange: (wert: number) => void;
}

/** Eingabe 1–5 Sterne als Radio-Gruppe (Tastatur- und Screenreader-tauglich). */
export function SterneEingabe({ name, label, wert, onChange }: SterneEingabeProps) {
  const { t } = useTranslation("partner");
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-[10px] uppercase text-text-tertiary">{label}</legend>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              value={n}
              checked={wert === n}
              onChange={() => onChange(n)}
              className="peer sr-only"
              aria-label={`${label}: ${t("sterne_n", { count: n })}`}
            />
            <span
              aria-hidden="true"
              className={`text-xl peer-focus-visible:ring-2 peer-focus-visible:ring-ca ${
                n <= wert ? "text-amber-500" : "text-text-tertiary/40"
              }`}
            >
              ★
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
