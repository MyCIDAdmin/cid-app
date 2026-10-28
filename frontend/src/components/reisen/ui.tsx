/** Kleine gemeinsame Bausteine des Reisemoduls : Eingabeklassen, Countdown, Fehlerzeile. */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { restzeit } from "../../utils/reisen";

export const FELD = "w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm";
export const KNOPF =
  "rounded-cid bg-ca px-3 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-50";
export const KNOPF_LEISE =
  "rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-tertiary disabled:opacity-50";
export const KARTE = "rounded-cid-lg bg-bg-primary p-3 shadow-sm";

export function Fehler({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p role="alert" className="text-xs text-red-600">
      {text}
    </p>
  );
}

/** Restzeit bis zur Frist. Die letzten 24 Stunden sind hervorgehoben. */
export function Countdown({ frist }: { frist: string | null }) {
  const { t } = useTranslation("reisen");
  const [jetzt, setJetzt] = useState(() => Date.now());
  useEffect(() => {
    if (!frist) return;
    const id = window.setInterval(() => setJetzt(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, [frist]);
  const r = restzeit(frist, jetzt);
  if (!r) return null;
  if (r.abgelaufen)
    return <span className="text-xs text-text-tertiary">{t("countdown.abgelaufen")}</span>;
  const text =
    r.tage > 0
      ? t("countdown.tage", { tage: r.tage, stunden: r.stunden })
      : t("countdown.stunden", { stunden: r.stunden, minuten: r.minuten });
  return (
    <span
      data-testid="countdown"
      className={`text-xs font-medium ${r.dringend ? "text-red-600" : "text-text-secondary"}`}
    >
      {t("countdown.noch", { zeit: text })}
    </span>
  );
}
