/** GIF-Auswahl : Suche und Trends über unseren Server (GIPHY, ohne Kennung der Mitglieder). */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useGifSuche } from "../../hooks/useChats";
import type { GifDaten } from "../../types/communaute";
import { FELD } from "./ui";

const SCHLAGWORTE = ["tor", "jubel", "danke", "reise", "lachen"] as const;

export default function GifAuswahl({ onWaehle }: { onWaehle: (gif: GifDaten) => void }) {
  const { t } = useTranslation("communaute");
  const [eingabe, setEingabe] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const id = window.setTimeout(() => setQ(eingabe.trim()), 350);
    return () => window.clearTimeout(id);
  }, [eingabe]);
  const abfrage = useGifSuche(q, true);

  return (
    <div data-testid="gif-auswahl" className="border-t border-text-tertiary/15 bg-bg-primary p-2">
      <input
        type="search"
        value={eingabe}
        onChange={(e) => setEingabe(e.target.value)}
        placeholder={t("chats.gif_suchen")}
        aria-label={t("chats.gif_suchen")}
        className={FELD}
      />
      <div className="my-1.5 flex gap-1.5 overflow-x-auto">
        {SCHLAGWORTE.map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => setEingabe(t(`chats.gif_tag_${w}`))}
            className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold text-text-secondary hover:bg-bg-secondary"
          >
            {t(`chats.gif_tag_${w}`)}
          </button>
        ))}
      </div>
      {abfrage.isLoading && <p className="p-2 text-xs text-text-tertiary">{t("chats.laden")}</p>}
      {abfrage.isError && (
        <p className="p-2 text-xs text-status-dangerText">{t("chats.gif_fehler")}</p>
      )}
      {abfrage.data?.length === 0 && (
        <p className="p-2 text-xs text-text-tertiary">{t("chats.nichts_gefunden")}</p>
      )}
      <div className="grid max-h-44 grid-cols-3 gap-1.5 overflow-y-auto sm:grid-cols-4">
        {abfrage.data?.map((g) => (
          <button
            key={g.id}
            type="button"
            data-testid="gif-treffer"
            aria-label={g.titel || t("chats.gif")}
            onClick={() => onWaehle({ url: g.url, vorschau: g.vorschau, titel: g.titel })}
            className="overflow-hidden rounded-cid bg-bg-secondary"
          >
            <img
              src={g.vorschau}
              alt={g.titel}
              loading="lazy"
              className="h-20 w-full object-cover"
            />
          </button>
        ))}
      </div>
      <p className="mt-1 text-[10px] text-text-tertiary">{t("chats.gif_hinweis")}</p>
    </div>
  );
}
