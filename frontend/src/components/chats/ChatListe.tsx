/** Linke Spalte : Suche, Filter, angeheftete und weitere Chats. */
import { IconBellOff, IconPlus, IconSearch } from "@tabler/icons-react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import type { ChatListItem } from "../../types/chats";
import {
  filtereChats,
  listenZeit,
  sortiereChats,
  type ListenFilter,
} from "../../utils/chatsDesign";
import ChatAvatar from "./ChatAvatar";
import { FELD } from "./ui";

const FILTER: ListenFilter[] = ["alle", "ungelesen", "personen", "gruppen", "reisen"];

interface Props {
  chats: ChatListItem[] | undefined;
  laedt: boolean;
  fehler: boolean;
  gewaehlt?: { art: string; id: string };
  filter: ListenFilter;
  suche: string;
  onFilter: (f: ListenFilter) => void;
  onSuche: (s: string) => void;
  onWaehle: (chat: ChatListItem) => void;
  onNeu: () => void;
  onEntdecken: () => void;
}

function Vorschau({ chat, t }: { chat: ChatListItem; t: TFunction<"communaute"> }) {
  const l = chat.letzte;
  if (!l) return <span className="italic">{t("chats.noch_nichts")}</span>;
  const prefix = l.ich ? `${t("chats.du")}: ` : chat.art !== "direkt" ? `${l.von}: ` : "";
  return (
    <>
      {prefix}
      {l.art === "gif" ? t("chats.vorschau_gif") : l.text}
    </>
  );
}

export default function ChatListe(props: Props) {
  const { t, i18n } = useTranslation("communaute");
  const { chats, laedt, fehler, gewaehlt, filter, suche } = props;
  const liste = sortiereChats(filtereChats(chats ?? [], filter, suche));
  const angeheftet = liste.filter((c) => c.angeheftet);
  const weitere = liste.filter((c) => !c.angeheftet);
  const ungelesen = (chats ?? []).filter((c) => c.nicht_gelesen > 0).length;

  const zeile = (c: ChatListItem) => {
    const aktiv = gewaehlt?.id === c.id;
    return (
      <li key={`${c.art}-${c.id}`}>
        <button
          type="button"
          data-testid={`chat-${c.id}`}
          aria-current={aktiv ? "true" : undefined}
          onClick={() => props.onWaehle(c)}
          className={`flex w-full items-center gap-3 rounded-cid-lg px-2 py-2 text-left hover:bg-bg-secondary ${
            aktiv ? "bg-bg-secondary shadow-sm" : ""
          }`}
        >
          <ChatAvatar name={c.name} art={c.art} photo={c.partner?.photo} online={c.online} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-sm font-bold text-text-primary">{c.name}</span>
              {c.art === "reise" && (
                <span className="shrink-0 rounded-full bg-status-warningBg px-1.5 text-[10px] font-bold text-status-warningText">
                  {t("chats.marke_reise")}
                </span>
              )}
              {c.art === "gruppe" && c.privat && (
                <span className="shrink-0 rounded-full bg-cal px-1.5 text-[10px] font-bold text-cad">
                  {t("chats.marke_privat")}
                </span>
              )}
              {c.stumm && (
                <IconBellOff
                  size={13}
                  className="shrink-0 text-text-tertiary"
                  aria-label={t("chats.stumm")}
                />
              )}
            </span>
            <span
              className={`block truncate text-xs ${
                c.nicht_gelesen > 0 ? "font-semibold text-text-primary" : "text-text-tertiary"
              }`}
            >
              <Vorschau chat={c} t={t} />
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1 text-[11px] text-text-tertiary">
            {c.letzte && <span>{listenZeit(c.letzte.zeit, i18n.language)}</span>}
            {c.nicht_gelesen > 0 && (
              <span
                aria-label={t("chats.ungelesen_aria", { count: c.nicht_gelesen })}
                className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-ca px-1.5 text-[11px] font-bold text-white"
              >
                {c.nicht_gelesen}
              </span>
            )}
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
        <h1 className="font-display text-2xl text-text-primary">{t("chats.titel")}</h1>
        <button
          type="button"
          onClick={props.onNeu}
          aria-label={t("chats.neuer_chat")}
          className="inline-flex h-10 w-10 items-center justify-center rounded-cid bg-ca text-white hover:bg-cad"
        >
          <IconPlus size={20} />
        </button>
      </div>
      <div className="px-3">
        <label className="relative block">
          <IconSearch
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            type="search"
            value={suche}
            onChange={(e) => props.onSuche(e.target.value)}
            placeholder={t("chats.suche")}
            aria-label={t("chats.suche")}
            className={`${FELD} pl-9`}
          />
        </label>
        <div
          role="group"
          aria-label={t("chats.filter")}
          className="mt-2 flex gap-1.5 overflow-x-auto pb-1"
        >
          {FILTER.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => props.onFilter(f)}
              className="min-h-[34px] shrink-0 rounded-full border border-text-tertiary/25 bg-bg-primary px-3 text-xs font-semibold text-text-secondary aria-pressed:border-ca aria-pressed:bg-ca aria-pressed:text-white"
            >
              {t(`chats.filter_${f}`)}
              {f === "ungelesen" && ungelesen > 0 ? ` · ${ungelesen}` : ""}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-1 min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        {laedt && <p className="p-3 text-sm text-text-tertiary">{t("chats.laden")}</p>}
        {fehler && <p className="p-3 text-sm text-status-dangerText">{t("chats.fehler_laden")}</p>}
        {!laedt && !fehler && liste.length === 0 && (
          <p className="p-3 text-sm text-text-tertiary">
            {suche || filter !== "alle" ? t("chats.nichts_gefunden") : t("chats.keine_chats")}
          </p>
        )}
        {angeheftet.length > 0 && (
          <>
            <h2 className="px-2 pb-1 pt-3 text-[11px] font-bold uppercase tracking-widest text-text-tertiary">
              {t("chats.angeheftet")}
            </h2>
            <ul className="space-y-0.5">{angeheftet.map(zeile)}</ul>
          </>
        )}
        {weitere.length > 0 && (
          <>
            {angeheftet.length > 0 && (
              <h2 className="px-2 pb-1 pt-3 text-[11px] font-bold uppercase tracking-widest text-text-tertiary">
                {t("chats.weitere")}
              </h2>
            )}
            <ul className="space-y-0.5">{weitere.map(zeile)}</ul>
          </>
        )}
        <button
          type="button"
          onClick={props.onEntdecken}
          className="mt-3 flex min-h-[44px] w-full items-center gap-2 rounded-cid-lg border border-dashed border-text-tertiary/40 px-3 text-sm font-semibold text-ca hover:bg-bg-secondary"
        >
          {t("chats.gruppen_entdecken")}
        </button>
      </div>
    </div>
  );
}
