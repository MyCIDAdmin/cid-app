/**
 * Karte des laufenden Rundgangs (Variante „Leise Begleitung“) : nichts wird abgedunkelt, das
 * Ziel erhält nur einen sanft pulsierenden Ring, die App bleibt bedienbar. Die Karte steht unten
 * rechts (Handy : als Leiste am unteren Rand). Findet sich das Ziel nicht (z. B. verborgen), bleibt
 * die Karte ohne Ring stehen.
 */
import { IconX } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { TourStation } from "../../utils/tour";
import { findeZiel } from "../../utils/tourZiel";

interface Rechteck {
  x: number;
  y: number;
  width: number;
  height: number;
}

function useZielRechteck(ziel: string): Rechteck | null {
  const [rect, setRect] = useState<Rechteck | null>(null);
  useEffect(() => {
    let zentriert = false;
    function messen() {
      const el = findeZiel(ziel);
      if (!el) {
        setRect((alt) => (alt === null ? alt : null));
        return;
      }
      if (!zentriert) {
        zentriert = true;
        el.scrollIntoView?.({ block: "center" });
      }
      const r = el.getBoundingClientRect();
      setRect((alt) =>
        alt &&
        Math.abs(alt.x - r.x) < 0.5 &&
        Math.abs(alt.y - r.y) < 0.5 &&
        Math.abs(alt.width - r.width) < 0.5 &&
        Math.abs(alt.height - r.height) < 0.5
          ? alt
          : { x: r.x, y: r.y, width: r.width, height: r.height },
      );
    }
    messen();
    const timer = window.setInterval(messen, 250);
    window.addEventListener("resize", messen);
    window.addEventListener("scroll", messen, true);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", messen);
      window.removeEventListener("scroll", messen, true);
      setRect(null);
    };
  }, [ziel]);
  return rect;
}

interface Props {
  station: TourStation;
  schritt: number;
  gesamt: number;
  onWeiter: () => void;
  onZurueck: () => void;
  onUeberspringen: () => void;
}

export default function TourKarte({
  station,
  schritt,
  gesamt,
  onWeiter,
  onZurueck,
  onUeberspringen,
}: Props) {
  const { t } = useTranslation("tour");
  const rect = useZielRechteck(station.ziel);
  const weiterKnopf = useRef<HTMLButtonElement>(null);
  const letzte = schritt === gesamt - 1;

  // Fokus wandert mit jedem Schritt in die Karte (Tastatur und Screenreader folgen der Tour).
  useEffect(() => weiterKnopf.current?.focus(), [station.id]);

  return (
    <>
      {rect && (
        <div
          aria-hidden="true"
          data-testid="tour-ring"
          className="pointer-events-none fixed z-[70] rounded-cid border-2 border-white shadow-[0_0_0_2px_var(--color-ca),0_0_14px_5px_rgba(255,255,255,0.45)] motion-safe:animate-pulse"
          style={{
            left: rect.x - 4,
            top: rect.y - 4,
            width: rect.width + 8,
            height: rect.height + 8,
          }}
        />
      )}
      <div
        role="dialog"
        aria-modal="false"
        aria-label={t("karte.dialog")}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" && !letzte) onWeiter();
          if (e.key === "ArrowLeft" && schritt > 0) onZurueck();
        }}
        className="fixed inset-x-3 bottom-3 z-[70] rounded-cid-lg border border-text-tertiary/20 bg-bg-primary p-4 shadow-2xl lg:inset-x-auto lg:bottom-4 lg:right-4 lg:w-80"
      >
        <button
          type="button"
          onClick={onUeberspringen}
          aria-label={t("karte.schliessen")}
          className="absolute right-2 top-2 rounded-cid p-1 text-text-tertiary hover:bg-bg-tertiary"
        >
          <IconX size={16} />
        </button>
        <div className="mb-2 flex items-center gap-1.5" aria-hidden="true">
          {Array.from({ length: gesamt }, (_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full ${
                i === schritt ? "w-4 bg-ca" : "w-1.5 bg-text-tertiary opacity-40"
              }`}
            />
          ))}
        </div>
        <p className="sr-only" aria-live="polite">
          {t("karte.schritt", { n: schritt + 1, gesamt })}
        </p>
        <h3 className="pr-6 text-sm font-bold text-text-primary">
          {t(`${station.textWurzel ?? "stationen"}.${station.id}.titel`)}
        </h3>
        <p className="mt-1 text-sm text-text-secondary">
          {t(`${station.textWurzel ?? "stationen"}.${station.id}.text`)}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onUeberspringen}
            className="mr-auto text-xs font-medium text-text-secondary underline hover:text-text-primary"
          >
            {t("karte.ueberspringen")}
          </button>
          {schritt > 0 && (
            <button
              type="button"
              onClick={onZurueck}
              className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-tertiary"
            >
              {t("karte.zurueck")}
            </button>
          )}
          <button
            ref={weiterKnopf}
            type="button"
            onClick={onWeiter}
            className="rounded-cid bg-ca px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            {letzte ? t("karte.fertig") : t("karte.weiter")}
          </button>
        </div>
      </div>
    </>
  );
}
