/**
 * Sichten des Kalenders kombinieren : Vereinskalender, Büro-Kalender und „Meine Termine“ lassen
 * sich einzeln oder gemeinsam einschalten. Mindestens eine Sicht bleibt immer aktiv.
 */
import { useTranslation } from "react-i18next";

import type { Ansicht } from "../../types/kalender";

interface Props {
  verfuegbar: Ansicht[];
  aktiv: Ansicht[];
  onChange: (neu: Ansicht[]) => void;
}

export default function AnsichtWaehler({ verfuegbar, aktiv, onChange }: Props) {
  const { t } = useTranslation("kalender");

  function umschalten(a: Ansicht) {
    if (aktiv.includes(a)) {
      if (aktiv.length === 1) return;
      onChange(aktiv.filter((x) => x !== a));
    } else {
      onChange(verfuegbar.filter((x) => x === a || aktiv.includes(x)));
    }
  }

  return (
    <div role="group" aria-label={t("sichten")} className="flex flex-wrap items-center gap-2">
      {verfuegbar.map((a) => {
        const an = aktiv.includes(a);
        return (
          <button
            key={a}
            type="button"
            aria-pressed={an}
            onClick={() => umschalten(a)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              an
                ? "border-ca bg-ca text-white"
                : "border-text-tertiary/30 text-text-secondary hover:text-text-primary"
            }`}
          >
            {an && "✓ "}
            {t(`tab.${a}`)}
          </button>
        );
      })}
      {verfuegbar.length > 1 && aktiv.length < verfuegbar.length && (
        <button
          type="button"
          onClick={() => onChange(verfuegbar)}
          className="text-xs text-ca underline"
        >
          {t("alle_sichten")}
        </button>
      )}
    </div>
  );
}
