/**
 * Kleiner Info-Hinweis (ⓘ) neben einer Aktion der Verwaltung (Nutzerwunsch 2026-10-06 : Hilfe
 * mit "interaktiven Hinweisen" für Zahlungen, Finanzen und den Projekt-Arbeitsbereich). Klick,
 * Tastatur oder Mauszeiger blenden eine kurze Erklärung ein ; Escape oder ein Klick daneben
 * schließt sie. Der Text steht in public/locales/<lng>/help.json unter `tip.<schlüssel>`.
 */
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

interface InfoTipProps {
  /** Schlüssel unter `tip.` in help.json. */
  k: string;
  className?: string;
}

export default function InfoTip({ k, className = "" }: InfoTipProps) {
  const { t } = useTranslation("help");
  const [offen, setOffen] = useState(false);
  const wurzel = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!offen) return;
    const schliessen = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e instanceof MouseEvent && wurzel.current?.contains(e.target as Node)) return;
      setOffen(false);
    };
    document.addEventListener("mousedown", schliessen);
    document.addEventListener("keydown", schliessen);
    return () => {
      document.removeEventListener("mousedown", schliessen);
      document.removeEventListener("keydown", schliessen);
    };
  }, [offen]);

  return (
    <span
      ref={wurzel}
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setOffen(true)}
      onMouseLeave={() => setOffen(false)}
    >
      <button
        type="button"
        aria-label={t("info")}
        aria-expanded={offen}
        aria-describedby={offen ? id : undefined}
        onClick={() => setOffen((o) => !o)}
        className="flex h-5 w-5 items-center justify-center rounded-full border border-text-tertiary/40 text-[11px] font-bold text-text-tertiary hover:bg-bg-tertiary"
      >
        i
      </button>
      {offen && (
        <span
          id={id}
          role="tooltip"
          className="absolute left-1/2 top-full z-40 mt-1 w-64 -translate-x-1/2 rounded-cid border border-text-tertiary/20 bg-bg-primary p-2 text-left text-xs font-normal normal-case text-text-secondary shadow-lg"
        >
          {t(`tip.${k}`)}
        </span>
      )}
    </span>
  );
}
