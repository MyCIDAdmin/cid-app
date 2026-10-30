/**
 * Führt den REST-Verlauf und die WebSocket-Ereignisse eines Chats zu einer einheitlichen Liste
 * `ChatNachricht[]` zusammen (Direkt- und Gruppenchat). Likes, Reaktionen, Anheften, Umfrage-
 * Stimmen und Löschungen werden als Ereignisse auf den Verlauf angewendet.
 */
import { useCallback, useMemo, useState } from "react";

import { useAuthStore } from "../store/authStore";
import type { ChatKanal, ChatNachricht } from "../types/chats";
import type { MessageGroupe, MessagePrive, Reaktion, UmfrageErgebnis } from "../types/communaute";
import { useMessagesGroupe, useMessagesPrives } from "./useCommunaute";
import type { SocketEreignisse, SocketNachricht } from "./useChatSocket";

function name(a?: { prenom?: string; nom?: string }): string {
  return a ? `${a.prenom ?? ""} ${a.nom ?? ""}`.trim() : "";
}

function ausPrive(m: MessagePrive, partnerName: string): ChatNachricht {
  return {
    id: m.id,
    art: m.art ?? "text",
    text: m.contenu,
    daten: m.daten ?? null,
    vonId: m.expediteur,
    vonName: m.est_expediteur ? "" : partnerName,
    ich: m.est_expediteur,
    zeit: m.created_at,
    likes: m.nombre_likes,
    jaime: m.jaime,
    reaktionen: m.reaktionen ?? [],
    angeheftet: m.angeheftet ?? false,
    antwort: m.repond_a_detail
      ? {
          id: m.repond_a_detail.id,
          text: m.repond_a_detail.contenu,
          name: name(m.repond_a_detail.expediteur),
        }
      : null,
    umfrage: null,
    gelesen: m.est_lu,
  };
}

function ausGruppe(m: MessageGroupe): ChatNachricht {
  return {
    id: m.id,
    art: m.art ?? "text",
    text: m.contenu,
    daten: m.daten ?? null,
    vonId: m.auteur.id,
    vonName: name(m.auteur),
    ich: m.est_auteur,
    zeit: m.created_at,
    likes: m.nombre_likes,
    jaime: m.jaime,
    reaktionen: m.reaktionen ?? [],
    angeheftet: m.angeheftet ?? false,
    antwort: m.repond_a_detail
      ? {
          id: m.repond_a_detail.id,
          text: m.repond_a_detail.contenu,
          name: name(m.repond_a_detail.auteur),
        }
      : null,
    umfrage: m.umfrage ?? null,
    gelesen: false,
  };
}

function ausSocket(
  s: SocketNachricht,
  kanal: ChatKanal,
  moiId: string | undefined,
  partnerName: string,
): ChatNachricht {
  const vonId = kanal === "direkt" ? (s.expediteur ?? null) : (s.auteur?.id ?? null);
  const ich = vonId !== null && vonId === moiId;
  const rep = s.repond_a_detail;
  return {
    id: s.id,
    art: s.art ?? "text",
    text: s.contenu,
    daten: s.daten ?? null,
    vonId,
    vonName: ich ? "" : kanal === "direkt" ? partnerName : name(s.auteur),
    ich,
    zeit: s.created_at,
    likes: s.nombre_likes,
    jaime: false,
    reaktionen: s.reaktionen ?? [],
    angeheftet: s.angeheftet ?? false,
    antwort: rep
      ? { id: rep.id, text: rep.contenu, name: name(rep.auteur ?? rep.expediteur) }
      : null,
    umfrage: s.umfrage ?? null,
    gelesen: false,
  };
}

function wendeReaktionAn(
  liste: Reaktion[],
  e: SocketEreignisse["reaktionen"][number],
  moiId: string | undefined,
): Reaktion[] {
  const ich = e.membre_id === moiId;
  const vorhanden = liste.find((r) => r.emoji === e.emoji);
  if (e.anzahl <= 0) return liste.filter((r) => r.emoji !== e.emoji);
  if (!vorhanden)
    return [...liste, { emoji: e.emoji, anzahl: e.anzahl, ich: ich ? e.aktiv : false }];
  return liste.map((r) =>
    r.emoji === e.emoji ? { ...r, anzahl: e.anzahl, ich: ich ? e.aktiv : r.ich } : r,
  );
}

export function useChatNachrichten(
  kanal: ChatKanal | undefined,
  id: string | undefined,
  socketNachrichten: SocketNachricht[],
  ereignisse: SocketEreignisse,
  partnerName = "",
) {
  const moiId = useAuthStore((s) => s.user?.id);
  const prive = useMessagesPrives(kanal === "direkt" ? id : undefined);
  const gruppe = useMessagesGroupe(kanal === "gruppe" ? id : undefined);
  const [umfrageEigen, setUmfrageEigen] = useState<Record<string, UmfrageErgebnis>>({});

  const verlauf = kanal === "direkt" ? prive : gruppe;

  const nachrichten = useMemo<ChatNachricht[]>(() => {
    if (!kanal) return [];
    const basis: ChatNachricht[] =
      kanal === "direkt"
        ? (prive.data?.results ?? []).map((m) => ausPrive(m, partnerName))
        : (gruppe.data?.results ?? []).map(ausGruppe);
    const ids = new Set(basis.map((m) => m.id));
    const neu = socketNachrichten
      .filter((s) => !ids.has(s.id))
      .map((s) => ausSocket(s, kanal, moiId, partnerName));
    const geloescht = new Set(ereignisse.geloescht);
    let liste = [...basis, ...neu].filter((m) => !geloescht.has(m.id));

    for (const e of ereignisse.likes) {
      liste = liste.map((m) =>
        m.id === e.id
          ? { ...m, likes: e.nombre_likes, jaime: e.membre_id === moiId ? e.aime : m.jaime }
          : m,
      );
    }
    for (const e of ereignisse.reaktionen) {
      liste = liste.map((m) =>
        m.id === e.id ? { ...m, reaktionen: wendeReaktionAn(m.reaktionen, e, moiId) } : m,
      );
    }
    for (const e of ereignisse.pins) {
      liste = liste.map((m) => (m.id === e.id ? { ...m, angeheftet: e.angeheftet } : m));
    }
    for (const e of ereignisse.umfragen) {
      liste = liste.map((m) =>
        m.id === e.id && m.umfrage
          ? { ...m, umfrage: { ...m.umfrage, zaehler: e.zaehler, gesamt: e.gesamt } }
          : m,
      );
    }
    liste = liste.map((m) => {
      const eigen = umfrageEigen[m.id];
      return eigen && m.umfrage ? { ...m, umfrage: { ...m.umfrage, meine: eigen.meine } } : m;
    });
    if (kanal === "direkt" && ereignisse.gelesenVon.length > 0) {
      liste = liste.map((m) => (m.ich ? { ...m, gelesen: true } : m));
    }
    return liste;
  }, [
    kanal,
    prive.data,
    gruppe.data,
    socketNachrichten,
    ereignisse,
    moiId,
    partnerName,
    umfrageEigen,
  ]);

  const merkeEigeneStimme = useCallback((messageId: string, umfrage: UmfrageErgebnis) => {
    setUmfrageEigen((p) => ({ ...p, [messageId]: umfrage }));
  }, []);

  return {
    nachrichten,
    laedt: verlauf.isLoading,
    fehler: verlauf.isError,
    merkeEigeneStimme,
  };
}
