/**
 * Willkommensfenster beim ersten Login : bietet die Rundgänge an, startet nie von selbst.
 * „Später erinnern“ (Escape) verschiebt es auf den nächsten Tag, „Nicht mehr anzeigen“ beendet die
 * Angebote dauerhaft ; unter Hilfe bleibt der Rundgang immer abrufbar.
 */
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { useEscapeSchliessen } from "../../hooks/useEscapeSchliessen";
import type { TourArt } from "../../utils/tour";

interface Props {
  arten: TourArt[];
  istFan: boolean;
  name: string;
  minutenVerwaltung: number;
  onStart: (art: TourArt) => void;
  onSpaeter: () => void;
  onNieMehr: () => void;
}

export default function WillkommenDialog({
  arten,
  istFan,
  name,
  minutenVerwaltung,
  onStart,
  onSpaeter,
  onNieMehr,
}: Props) {
  const { t } = useTranslation("tour");
  const ersterKnopf = useRef<HTMLButtonElement>(null);
  useEscapeSchliessen(onSpaeter);
  useEffect(() => ersterKnopf.current?.focus(), []);

  const nurVerwaltung = arten.length === 1 && arten[0] === "verwaltung";
  const beide = arten.includes("app") && arten.includes("verwaltung");
  const titel = istFan
    ? t("willkommen.titel_fan")
    : name
      ? t("willkommen.titel_name", { name })
      : t("willkommen.titel");
  const text = istFan
    ? t("willkommen.text_fan")
    : beide || nurVerwaltung
      ? t("willkommen.text_verwaltung")
      : t("willkommen.text");

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[1px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-willkommen-titel"
        className="w-full max-w-md rounded-cid-lg border border-text-tertiary/20 bg-bg-primary p-6 text-center shadow-2xl"
      >
        <div
          aria-hidden="true"
          className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-ca text-sm font-extrabold text-white"
        >
          CID
        </div>
        <h2 id="tour-willkommen-titel" className="font-display text-xl font-bold text-text-primary">
          {titel}
        </h2>
        <p className="mt-2 text-sm text-text-secondary">{text}</p>
        <div className="mt-5 flex flex-col gap-2">
          {arten.includes("app") && (
            <button
              ref={ersterKnopf}
              type="button"
              onClick={() => onStart("app")}
              className="rounded-cid bg-ca px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              {beide ? t("willkommen.start_app") : t("willkommen.start_kurz")}
            </button>
          )}
          {arten.includes("verwaltung") && (
            <button
              ref={arten.includes("app") ? undefined : ersterKnopf}
              type="button"
              onClick={() => onStart("verwaltung")}
              className="rounded-cid bg-ca px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              {t("willkommen.start_verwaltung", { minuten: minutenVerwaltung })}
            </button>
          )}
          <button
            type="button"
            onClick={onSpaeter}
            className="rounded-cid border border-text-tertiary/30 px-4 py-2 text-sm font-medium text-text-primary hover:bg-bg-tertiary"
          >
            {t("willkommen.spaeter")}
          </button>
          <button
            type="button"
            onClick={onNieMehr}
            className="mx-auto text-xs font-medium text-text-secondary underline hover:text-text-primary"
          >
            {t("willkommen.nie")}
          </button>
        </div>
      </div>
    </div>
  );
}
