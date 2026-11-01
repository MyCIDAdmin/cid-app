/**
 * Emoji-Reaktionen unter einem Inhalt (Neuigkeit, Kommentar, Forumsthema, Forumsantwort) – gleiche
 * Bedienung wie im Chat : Chips mit Zähler (eigene hervorgehoben), „☺ +“ öffnet eine Schnell-Leiste
 * und die Emoji-Auswahl. Zeigt nur Zähler und „ich“, keine Namen.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useEscapeSchliessen } from "../../hooks/useEscapeSchliessen";
import type { Reaktion } from "../../types/communaute";
import { SCHNELL_REAKTIONEN } from "../../utils/chatsDesign";
import EmojiAuswahl from "../chats/EmojiAuswahl";

interface Props {
  reaktionen: Reaktion[];
  onReagieren: (emoji: string) => void;
  /** Gesperrt (z. B. während die Anfrage läuft). */
  deaktiviert?: boolean;
  klein?: boolean;
}

export const FIL_SCHNELL_REAKTIONEN = ["❤️", ...SCHNELL_REAKTIONEN] as const;

function Auswahl({
  onWaehle,
  onSchliessen,
}: {
  onWaehle: (emoji: string) => void;
  onSchliessen: () => void;
}) {
  const { t } = useTranslation("communaute");
  const [mehr, setMehr] = useState(false);
  useEscapeSchliessen(onSchliessen);
  return (
    <>
      <button
        type="button"
        aria-label={t("reaktionen.schliessen")}
        tabIndex={-1}
        onClick={onSchliessen}
        className="fixed inset-0 z-10 cursor-default"
      />
      <div
        role="dialog"
        aria-label={t("reaktionen.waehlen")}
        className="absolute left-0 top-full z-20 mt-1 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-cid-lg border border-text-tertiary/20 bg-bg-primary shadow-xl"
      >
        <div className="flex items-center gap-0.5 p-1.5">
          {FIL_SCHNELL_REAKTIONEN.map((e) => (
            <button
              key={e}
              type="button"
              aria-label={t("chats.reagieren_mit", { emoji: e })}
              onClick={() => onWaehle(e)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-xl hover:bg-bg-secondary"
            >
              {e}
            </button>
          ))}
          <button
            type="button"
            aria-expanded={mehr}
            aria-label={t("reaktionen.mehr")}
            onClick={() => setMehr((v) => !v)}
            className="ml-auto flex h-9 items-center rounded-full px-3 text-xs font-semibold text-text-secondary hover:bg-bg-secondary"
          >
            {mehr ? "−" : "+"}
          </button>
        </div>
        {mehr && <EmojiAuswahl onWaehle={onWaehle} />}
      </div>
    </>
  );
}

export default function ReaktionsLeiste({
  reaktionen,
  onReagieren,
  deaktiviert = false,
  klein = false,
}: Props) {
  const { t } = useTranslation("communaute");
  const [offen, setOffen] = useState(false);
  const groesse = klein ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs";

  function waehle(emoji: string) {
    setOffen(false);
    onReagieren(emoji);
  }

  return (
    <div className="relative flex flex-wrap items-center gap-1" data-testid="reaktionen">
      {reaktionen.map((r) => (
        <button
          key={r.emoji}
          type="button"
          disabled={deaktiviert}
          aria-pressed={r.ich}
          aria-label={t("chats.reaktion_aria", { emoji: r.emoji, count: r.anzahl })}
          onClick={() => onReagieren(r.emoji)}
          className={`inline-flex items-center gap-1 rounded-full border border-text-tertiary/25 bg-bg-primary aria-pressed:border-ca aria-pressed:bg-cal ${groesse}`}
        >
          <span>{r.emoji}</span>
          <span className="font-semibold text-text-secondary">{r.anzahl}</span>
        </button>
      ))}
      <button
        type="button"
        disabled={deaktiviert}
        aria-expanded={offen}
        aria-label={t("reaktionen.hinzufuegen")}
        onClick={() => setOffen((v) => !v)}
        className={`inline-flex items-center rounded-full border border-dashed border-text-tertiary/40 font-semibold text-text-tertiary hover:border-ca hover:text-ca ${groesse}`}
      >
        ☺ +
      </button>
      {offen && <Auswahl onWaehle={waehle} onSchliessen={() => setOffen(false)} />}
    </div>
  );
}
