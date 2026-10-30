/** Emoji-Auswahl mit Kategorien und „Zuletzt benutzt“ (liegt über dem Eingabefeld, nicht im
 * Portal : so wird sie nie von der Seitenleiste verdeckt). */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { EMOJI_KATEGORIEN } from "../../utils/chatsDesign";

const SCHLUESSEL = "cid.chats.emoji.zuletzt";
const MAX_ZULETZT = 16;

function leseZuletzt(): string[] {
  try {
    const roh = window.localStorage.getItem(SCHLUESSEL);
    const liste = roh ? JSON.parse(roh) : [];
    return Array.isArray(liste) ? liste.filter((e) => typeof e === "string") : [];
  } catch {
    return [];
  }
}

function merkeZuletzt(emoji: string): string[] {
  const neu = [emoji, ...leseZuletzt().filter((e) => e !== emoji)].slice(0, MAX_ZULETZT);
  try {
    window.localStorage.setItem(SCHLUESSEL, JSON.stringify(neu));
  } catch {
    /* Speicher gesperrt : die Auswahl funktioniert trotzdem */
  }
  return neu;
}

export default function EmojiAuswahl({ onWaehle }: { onWaehle: (emoji: string) => void }) {
  const { t } = useTranslation("communaute");
  const [zuletzt, setZuletzt] = useState<string[]>(leseZuletzt);
  const kategorien = [...(zuletzt.length ? ["zuletzt"] : []), ...Object.keys(EMOJI_KATEGORIEN)];
  const [kategorie, setKategorie] = useState(kategorien[0]);
  const emojis = kategorie === "zuletzt" ? zuletzt : (EMOJI_KATEGORIEN[kategorie] ?? []);

  return (
    <div data-testid="emoji-auswahl" className="border-t border-text-tertiary/15 bg-bg-primary p-2">
      <div
        role="tablist"
        aria-label={t("chats.emoji_kategorien")}
        className="mb-1 flex gap-1 overflow-x-auto"
      >
        {kategorien.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kategorie === k}
            onClick={() => setKategorie(k)}
            className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold text-text-secondary aria-selected:bg-ca aria-selected:text-white"
          >
            {t(`chats.emoji_${k}`)}
          </button>
        ))}
      </div>
      <div className="grid max-h-36 grid-cols-8 gap-0.5 overflow-y-auto sm:grid-cols-10">
        {emojis.map((e) => (
          <button
            key={e}
            type="button"
            aria-label={e}
            onClick={() => {
              setZuletzt(merkeZuletzt(e));
              onWaehle(e);
            }}
            className="flex h-9 items-center justify-center rounded text-xl hover:bg-bg-secondary"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
