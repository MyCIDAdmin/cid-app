/** Mittlere Spalte : Kopf, Reise-Leiste, angeheftete Nachricht, Verlauf mit Datumstrennern und
 * „Ab hier neu“, Eingabe. Eine Instanz je Chat (der Aufrufer setzt `key={chat.id}`). */
import { useEffect, useMemo, useRef, useState } from "react";
import { IconArrowLeft, IconInfoCircle, IconLock, IconPin } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import {
  useLikerMessageGroupe,
  useLikerMessagePrive,
  useSupprimerMessageGroupe,
  useSupprimerMessagePrive,
} from "../../hooks/useCommunaute";
import {
  chatKeys,
  useAbstimmen,
  useAnheften,
  useBearbeiten,
  useChatDienste,
  useGruppeGelesen,
  useGruppenMitglieder,
  useReagieren,
} from "../../hooks/useChats";
import { useChatNachrichten } from "../../hooks/useChatNachrichten";
import { useChatSocket } from "../../hooks/useChatSocket";
import { useAuthStore } from "../../store/authStore";
import type { ChatKanal, ChatListItem, ChatNachricht } from "../../types/chats";
import { langDatum, nachTagen, neuAbId, tagArt } from "../../utils/chatsDesign";
import ChatAvatar from "./ChatAvatar";
import Composer, { type SendeWunsch } from "./Composer";
import NachrichtBlase from "./NachrichtBlase";
import ReiseLeiste from "./ReiseLeiste";

interface Props {
  chat: ChatListItem;
  onZurueck: () => void;
  onInfo: () => void;
}

export default function Unterhaltung({ chat, onZurueck, onInfo }: Props) {
  const { t, i18n } = useTranslation("communaute");
  const queryClient = useQueryClient();
  const moiId = useAuthStore((s) => s.user?.id);
  const kanal: ChatKanal = chat.art === "direkt" ? "direkt" : "gruppe";
  const direkt = kanal === "direkt";

  const socket = useChatSocket(kanal, chat.id);
  const { nachrichten, laedt, fehler, merkeEigeneStimme } = useChatNachrichten(
    kanal,
    chat.id,
    socket.messages,
    socket.ereignisse,
    chat.name,
  );
  const dienste = useChatDienste().data;
  const mitglieder = useGruppenMitglieder(direkt ? undefined : chat.id);

  const likeGruppe = useLikerMessageGroupe();
  const likePrive = useLikerMessagePrive();
  const loescheGruppe = useSupprimerMessageGroupe();
  const loeschePrive = useSupprimerMessagePrive();
  const reagieren = useReagieren(kanal);
  const anheften = useAnheften(kanal);
  const abstimmen = useAbstimmen();
  const bearbeiten = useBearbeiten(kanal);
  const gelesen = useGruppeGelesen();

  const [antwort, setAntwort] = useState<ChatNachricht | null>(null);
  const [hervor, setHervor] = useState<string | null>(null);
  const [jetzt, setJetzt] = useState(() => Date.now());
  const ungelesenBeimOeffnen = useRef(chat.nicht_gelesen);
  const ende = useRef<HTMLDivElement>(null);

  const letzteFremde = [...nachrichten].reverse().find((n) => !n.ich && n.art !== "system")?.id;
  const anzahlSocket = socket.messages.length;

  // Als gelesen melden : beim Öffnen und bei jeder neuen fremden Nachricht ; danach die Liste auffrischen.
  useEffect(() => {
    if (socket.statut !== "ouvert") return undefined;
    if (direkt) socket.marquerLu();
    else gelesen.mutate(chat.id);
    const id = window.setTimeout(
      () => queryClient.invalidateQueries({ queryKey: chatKeys.liste }),
      700,
    );
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket.statut, letzteFremde, anzahlSocket]);

  useEffect(() => {
    ende.current?.scrollIntoView?.({ block: "end" });
  }, [nachrichten.length]);

  // Schreibpause : das Ereignis aus dem Kanal gilt vor dem Stand der Liste ; mit Ende läuft sie von selbst ab.
  const pauseEreignis = socket.ereignisse.pause;
  const pauseBis = pauseEreignis ? pauseEreignis.bis : chat.pause_bis;
  const pausiert =
    !direkt &&
    (pauseEreignis ? pauseEreignis.pausiert : chat.pausiert) &&
    (!pauseBis || new Date(pauseBis).getTime() > jetzt);
  const gesperrt = pausiert && !chat.ich_admin;

  useEffect(() => {
    if (pauseEreignis) queryClient.invalidateQueries({ queryKey: chatKeys.liste });
  }, [pauseEreignis, queryClient]);

  useEffect(() => {
    if (!pauseBis) return undefined;
    const rest = new Date(pauseBis).getTime() - Date.now();
    if (rest <= 0) return undefined;
    const id = window.setTimeout(() => setJetzt(Date.now()), Math.min(rest + 500, 2_147_000_000));
    return () => window.clearTimeout(id);
  }, [pauseBis]);

  const tage = useMemo(() => nachTagen(nachrichten), [nachrichten]);
  const neuId = neuAbId(nachrichten, ungelesenBeimOeffnen.current);
  const angeheftet = nachrichten.filter((n) => n.angeheftet && n.art !== "system");
  const letzteAngeheftet = angeheftet[angeheftet.length - 1];

  const namen = useMemo(() => {
    const karte = new Map<string, string>();
    for (const n of nachrichten) if (n.vonId && n.vonName) karte.set(n.vonId, n.vonName);
    for (const m of mitglieder.data ?? []) karte.set(m.id, `${m.prenom} ${m.nom}`);
    return karte;
  }, [nachrichten, mitglieder.data]);
  const tippende = socket.tippende.filter((id) => id !== moiId);
  const tipptText =
    tippende.length === 0
      ? ""
      : tippende.length === 1
        ? t("chats.tippt", {
            name: direkt ? chat.name : (namen.get(tippende[0]) ?? t("chats.jemand")),
          })
        : t("chats.tippen_mehrere", { count: tippende.length });

  function sende(w: SendeWunsch) {
    socket.envoyer({ contenu: w.contenu, art: w.art, daten: w.daten, repondA: w.repondA });
  }

  function springeZu(id: string) {
    setHervor(id);
    document
      .getElementById(`nachricht-${id}`)
      ?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    window.setTimeout(() => setHervor(null), 1800);
  }

  const untertitel = direkt
    ? chat.online
      ? t("chats.online")
      : ""
    : t("chats.mitglieder_anzahl", { count: chat.anzahl_mitglieder });

  const verbindungsHinweis =
    socket.statut === "ouvert"
      ? null
      : socket.statut === "connexion"
        ? t("chats.verbinde")
        : t("chats.getrennt");

  return (
    <section aria-label={chat.name} className="flex h-full min-h-0 flex-col bg-bg-primary">
      <header className="flex items-center gap-2 border-b border-text-tertiary/15 px-3 py-2">
        <button
          type="button"
          onClick={onZurueck}
          aria-label={t("chats.zurueck")}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-text-secondary hover:bg-bg-secondary lg:hidden"
        >
          <IconArrowLeft size={20} />
        </button>
        <ChatAvatar
          name={chat.name}
          art={chat.art}
          photo={chat.partner?.photo}
          online={chat.online}
          groesse="sm"
        />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-bold text-text-primary">{chat.name}</h2>
          {untertitel && <p className="truncate text-xs text-text-tertiary">{untertitel}</p>}
        </div>
        <button
          type="button"
          onClick={onInfo}
          aria-label={t("chats.info")}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-text-secondary hover:bg-bg-secondary"
        >
          <IconInfoCircle size={20} />
        </button>
      </header>

      {chat.reise && <ReiseLeiste reise={chat.reise} />}

      {letzteAngeheftet && (
        <button
          type="button"
          data-testid="angeheftet-leiste"
          onClick={() => springeZu(letzteAngeheftet.id)}
          className="flex items-center gap-2 border-b border-text-tertiary/15 bg-bg-secondary px-3 py-1.5 text-left text-xs text-text-secondary"
        >
          <IconPin size={14} className="shrink-0 text-ca" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">
            {letzteAngeheftet.art === "text"
              ? letzteAngeheftet.text
              : t(`chats.art_${letzteAngeheftet.art}`)}
          </span>
          {angeheftet.length > 1 && (
            <span className="shrink-0 font-bold">+{angeheftet.length - 1}</span>
          )}
        </button>
      )}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3" data-testid="verlauf">
        {laedt && <p className="text-sm text-text-tertiary">{t("chats.laden")}</p>}
        {fehler && <p className="text-sm text-status-dangerText">{t("chats.fehler_laden")}</p>}
        {!laedt && !fehler && nachrichten.length === 0 && (
          <p className="py-8 text-center text-sm text-text-tertiary">{t("chats.leer")}</p>
        )}
        {tage.map((tag) => {
          const art = tagArt(tag.zeit);
          return (
            <div key={tag.schluessel} className="space-y-2">
              <p className="my-2 text-center text-[11px] font-bold uppercase tracking-widest text-text-tertiary">
                {art === "heute"
                  ? t("chats.heute")
                  : art === "gestern"
                    ? t("chats.gestern")
                    : langDatum(tag.zeit, i18n.language)}
              </p>
              {tag.nachrichten.map((n) => (
                <div key={n.id} className="space-y-2">
                  {n.id === neuId && (
                    <p
                      data-testid="ab-hier-neu"
                      className="flex items-center gap-2 text-[11px] font-bold text-ca"
                    >
                      <span className="h-px flex-1 bg-ca/40" />
                      {t("chats.ab_hier_neu")}
                      <span className="h-px flex-1 bg-ca/40" />
                    </p>
                  )}
                  <NachrichtBlase
                    nachricht={n}
                    direkt={direkt}
                    dienste={dienste}
                    hervorgehoben={hervor === n.id}
                    onAntworten={setAntwort}
                    onLike={(id) => (direkt ? likePrive : likeGruppe).mutate(id)}
                    onReagieren={(id, emoji) => reagieren.mutate({ id, emoji })}
                    onAnheften={(id) => anheften.mutate(id)}
                    istAdmin={chat.ich_admin}
                    onLoeschen={(id) => (direkt ? loeschePrive : loescheGruppe).mutate(id)}
                    onBearbeiten={(id, text) =>
                      bearbeiten.mutateAsync({ id, contenu: text }).then(
                        () => true,
                        () => false,
                      )
                    }
                    onAbstimmen={(id, option) =>
                      abstimmen.mutate(
                        { id, option },
                        { onSuccess: (u) => u && merkeEigeneStimme(id, u) },
                      )
                    }
                  />
                </div>
              ))}
            </div>
          );
        })}
        <div ref={ende} />
      </div>

      <p aria-live="polite" className="h-4 px-4 text-[11px] italic text-text-tertiary">
        {tipptText || verbindungsHinweis}
      </p>

      {pausiert && (
        <p
          data-testid="pause-banner"
          role="status"
          className="flex items-center gap-2 border-t border-text-tertiary/15 bg-status-warningBg px-3 py-1.5 text-xs font-semibold text-status-warningText"
        >
          <IconLock size={14} aria-hidden="true" />
          {pauseBis
            ? t("chats.pause_bis", {
                zeit: new Date(pauseBis).toLocaleString(i18n.language, {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              })
            : t("chats.pause_aktiv")}
          {chat.ich_admin && ` ${t("chats.pause_admin_hinweis")}`}
        </p>
      )}

      <Composer
        gesperrt={gesperrt}
        verbunden={socket.statut === "ouvert"}
        gruppe={!direkt}
        dienste={dienste}
        mitglieder={mitglieder.data ?? []}
        antwort={antwort}
        fehler={socket.erreur}
        onAntwortAbbrechen={() => setAntwort(null)}
        onSenden={sende}
        onTippt={socket.tippSignal}
      />
    </section>
  );
}
