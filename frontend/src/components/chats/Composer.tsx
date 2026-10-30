/** Eingabezeile : Anhang-Menü (Umfrage, Treffpunkt), Emoji, GIF, Textfeld mit „@“-Vorschlägen,
 * Senden, dazu die Antwort-Leiste. Nachrichten gehen nur über den WebSocket (siehe
 * hooks/useChatSocket.ts) ; der Aufrufer übergibt `onSenden`. */
import { useRef, useState } from "react";
import {
  IconMoodSmile,
  IconPhoto,
  IconPlus,
  IconSend,
  IconX,
  IconChartBar,
  IconMapPin,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

import type { ChatDienste, ChatNachricht } from "../../types/chats";
import type {
  Auteur,
  GifDaten,
  NachrichtArt,
  NachrichtDaten,
  TreffpunktDaten,
  UmfrageDaten,
} from "../../types/communaute";
import EmojiAuswahl from "./EmojiAuswahl";
import GifAuswahl from "./GifAuswahl";
import TreffpunktDialog from "./TreffpunktDialog";
import UmfrageDialog from "./UmfrageDialog";
import { ICON_KNOPF } from "./ui";

export interface SendeWunsch {
  contenu: string;
  art: NachrichtArt;
  daten: NachrichtDaten;
  repondA?: string;
}

interface Props {
  verbunden: boolean;
  gruppe: boolean;
  dienste: ChatDienste | undefined;
  /** Mitglieder für die „@“-Vorschläge (nur Gruppen). */
  mitglieder: Auteur[];
  antwort: ChatNachricht | null;
  fehler: string | null;
  onAntwortAbbrechen: () => void;
  onSenden: (wunsch: SendeWunsch) => void;
  onTippt: () => void;
}

export default function Composer(props: Props) {
  const { t } = useTranslation("communaute");
  const { verbunden, gruppe, dienste, antwort } = props;
  const [text, setText] = useState("");
  const [panel, setPanel] = useState<"emoji" | "gif" | null>(null);
  const [menue, setMenue] = useState(false);
  const [dialog, setDialog] = useState<"umfrage" | "treffpunkt" | null>(null);
  const feld = useRef<HTMLInputElement>(null);

  const treffer = /(^|\s)@(\w*)$/.exec(text);
  const vorschlaege =
    gruppe && treffer
      ? props.mitglieder
          .filter((m) => m.prenom.toLowerCase().startsWith(treffer[2].toLowerCase()))
          .slice(0, 5)
      : [];

  function waehleMention(m: Auteur) {
    setText((alt) => alt.replace(/@\w*$/, `@${m.prenom} `));
    feld.current?.focus();
  }

  function sende(art: NachrichtArt, daten: NachrichtDaten, contenu = "") {
    props.onSenden({ contenu, art, daten, repondA: antwort?.id });
    props.onAntwortAbbrechen();
  }

  function absenden(e: React.FormEvent) {
    e.preventDefault();
    const inhalt = text.trim();
    if (!inhalt || !verbunden) return;
    sende("text", null, inhalt);
    setText("");
    setPanel(null);
  }

  function wechsle(p: "emoji" | "gif") {
    setMenue(false);
    setPanel((alt) => (alt === p ? null : p));
  }

  const menuePunkt =
    "flex min-h-[44px] w-full items-center gap-2 px-3 text-left text-sm font-semibold text-text-primary hover:bg-bg-secondary";

  return (
    <div className="border-t border-text-tertiary/15 bg-bg-primary">
      {antwort && (
        <div className="flex items-center justify-between gap-2 border-b border-text-tertiary/10 bg-bg-secondary px-3 py-1.5 text-xs text-text-tertiary">
          <span className="truncate">
            {t("chats.antwort_auf", { name: antwort.vonName || t("chats.du") })}: {antwort.text}
          </span>
          <button
            type="button"
            onClick={props.onAntwortAbbrechen}
            aria-label={t("chats.antwort_abbrechen")}
            className="shrink-0 hover:text-text-secondary"
          >
            <IconX size={14} />
          </button>
        </div>
      )}

      {panel === "emoji" && (
        <EmojiAuswahl
          onWaehle={(e) => {
            setText((alt) => `${alt}${e}`);
            feld.current?.focus();
          }}
        />
      )}
      {panel === "gif" && dienste?.gif && (
        <GifAuswahl
          onWaehle={(g: GifDaten) => {
            sende("gif", g);
            setPanel(null);
          }}
        />
      )}

      <form onSubmit={absenden} className="relative flex items-center gap-1.5 p-2">
        {vorschlaege.length > 0 && (
          <ul
            role="listbox"
            aria-label={t("chats.erwaehnen")}
            className="absolute bottom-full left-2 z-10 mb-1 w-56 overflow-hidden rounded-cid-lg border border-text-tertiary/20 bg-bg-primary py-1 shadow-xl"
          >
            {vorschlaege.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected="false"
                  onClick={() => waehleMention(m)}
                  className="block min-h-[40px] w-full px-3 text-left text-sm hover:bg-bg-secondary"
                >
                  {m.prenom} {m.nom}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="relative">
          <button
            type="button"
            className={ICON_KNOPF}
            aria-label={t("chats.anhang")}
            aria-expanded={menue}
            onClick={() => {
              setPanel(null);
              setMenue((m) => !m);
            }}
          >
            <IconPlus size={18} />
          </button>
          {menue && (
            <div
              role="menu"
              className="absolute bottom-full left-0 z-10 mb-1 w-48 overflow-hidden rounded-cid-lg border border-text-tertiary/20 bg-bg-primary py-1 shadow-xl"
            >
              {gruppe && (
                <button
                  type="button"
                  role="menuitem"
                  className={menuePunkt}
                  onClick={() => {
                    setMenue(false);
                    setDialog("umfrage");
                  }}
                >
                  <IconChartBar size={18} aria-hidden="true" />
                  {t("chats.umfrage")}
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                className={menuePunkt}
                onClick={() => {
                  setMenue(false);
                  setDialog("treffpunkt");
                }}
              >
                <IconMapPin size={18} aria-hidden="true" />
                {t("chats.treffpunkt")}
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          className={ICON_KNOPF}
          aria-label={t("chats.emoji")}
          aria-pressed={panel === "emoji"}
          onClick={() => wechsle("emoji")}
        >
          <IconMoodSmile size={18} />
        </button>
        {dienste?.gif && (
          <button
            type="button"
            className={ICON_KNOPF}
            aria-label={t("chats.gif")}
            aria-pressed={panel === "gif"}
            onClick={() => wechsle("gif")}
          >
            <IconPhoto size={18} />
          </button>
        )}

        <input
          ref={feld}
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            props.onTippt();
          }}
          placeholder={t("chats.nachricht_schreiben")}
          aria-label={t("chats.nachricht_schreiben")}
          disabled={!verbunden}
          className="min-h-[40px] min-w-0 flex-1 rounded-full border border-text-tertiary/30 bg-bg-secondary px-4 text-sm text-text-primary placeholder:text-text-tertiary focus:border-ca focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!verbunden || !text.trim()}
          aria-label={t("chats.senden")}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ca text-white hover:bg-cad disabled:opacity-50"
        >
          <IconSend size={18} />
        </button>
      </form>
      {props.fehler && <p className="px-3 pb-2 text-xs text-status-dangerText">{props.fehler}</p>}

      {dialog === "umfrage" && (
        <UmfrageDialog
          onClose={() => setDialog(null)}
          onSenden={(d: UmfrageDaten) => {
            sende("umfrage", d);
            setDialog(null);
          }}
        />
      )}
      {dialog === "treffpunkt" && (
        <TreffpunktDialog
          onClose={() => setDialog(null)}
          onSenden={(d: TreffpunktDaten) => {
            sende("treffpunkt", d);
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}
