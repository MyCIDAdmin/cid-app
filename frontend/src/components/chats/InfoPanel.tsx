/** Rechte Spalte (Handy : Fenster) : Mitglieder, Stumm/Anheften, Geteiltes, Gruppe verlassen,
 * löschen, Personen hinzufügen, Link zum Reiseraum. */
import { useState } from "react";
import {
  IconBell,
  IconBellOff,
  IconPin,
  IconPinnedOff,
  IconPlane,
  IconUserPlus,
} from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import {
  useGroupe,
  useInviterAuGroupe,
  useMessagesGroupe,
  useMessagesPrives,
  useQuitterGroupe,
  useRechercherMembres,
  useSupprimerGroupe,
} from "../../hooks/useCommunaute";
import { chatKeys, useChatEinstellung, useGruppenMitglieder } from "../../hooks/useChats";
import type { ChatListItem } from "../../types/chats";
import ChatAvatar from "./ChatAvatar";
import { FELD, KNOPF_LEISE } from "./ui";

interface Props {
  chat: ChatListItem;
  /** Nach Verlassen oder Löschen : zurück zur Liste. */
  onWeg: () => void;
}

function Schalter({
  an,
  onText,
  offText,
  onIcon,
  offIcon,
  onClick,
  testid,
}: {
  an: boolean;
  onText: string;
  offText: string;
  onIcon: React.ReactNode;
  offIcon: React.ReactNode;
  onClick: () => void;
  testid: string;
}) {
  return (
    <button
      type="button"
      data-testid={testid}
      aria-pressed={an}
      onClick={onClick}
      className={`${KNOPF_LEISE} flex-1`}
    >
      {an ? onIcon : offIcon}
      {an ? onText : offText}
    </button>
  );
}

function Hinzufuegen({ gruppeId, vorhanden }: { gruppeId: string; vorhanden: Set<string> }) {
  const { t } = useTranslation("communaute");
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const suche = useRechercherMembres(q, true);
  const einladen = useInviterAuGroupe();
  const treffer = (suche.data ?? []).filter((m) => !vorhanden.has(m.id)).slice(0, 6);
  return (
    <div className="mt-2 space-y-1.5">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("chats.person_suchen")}
        aria-label={t("chats.person_suchen")}
        className={FELD}
      />
      <ul>
        {treffer.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() =>
                einladen.mutate(
                  { id: gruppeId, membres: [m.id] },
                  {
                    onSuccess: () =>
                      queryClient.invalidateQueries({ queryKey: chatKeys.mitglieder(gruppeId) }),
                  },
                )
              }
              className="flex min-h-[44px] w-full items-center gap-2 rounded-cid px-2 text-left text-sm hover:bg-bg-secondary"
            >
              <ChatAvatar name={`${m.prenom} ${m.nom}`} photo={m.photo} groesse="sm" />
              {m.prenom} {m.nom}
            </button>
          </li>
        ))}
      </ul>
      {einladen.isError && (
        <p className="text-xs text-status-dangerText">{t("chats.fehler_aktion")}</p>
      )}
    </div>
  );
}

export default function InfoPanel({ chat, onWeg }: Props) {
  const { t } = useTranslation("communaute");
  const istGruppe = chat.art === "gruppe";
  const hatMitglieder = chat.art !== "direkt";
  const einstellung = useChatEinstellung();
  const mitglieder = useGruppenMitglieder(hatMitglieder ? chat.id : undefined);
  const gruppe = useGroupe(istGruppe ? chat.id : undefined);
  const verlassen = useQuitterGroupe();
  const loeschen = useSupprimerGroupe();
  const [bestaetige, setBestaetige] = useState<"verlassen" | "loeschen" | null>(null);
  const [hinzu, setHinzu] = useState(false);

  // Dieselben Abfragen wie die Unterhaltung (gemeinsamer Cache) : gezählt wird, was geladen ist.
  const verlaufPrive = useMessagesPrives(chat.art === "direkt" ? chat.id : undefined);
  const verlaufGruppe = useMessagesGroupe(chat.art === "direkt" ? undefined : chat.id);
  const nachrichten: { art: string; angeheftet?: boolean }[] =
    (chat.art === "direkt" ? verlaufPrive.data?.results : verlaufGruppe.data?.results) ?? [];
  const geteilt = {
    gif: nachrichten.filter((n) => n.art === "gif").length,
    treffpunkt: nachrichten.filter((n) => n.art === "treffpunkt").length,
    umfrage: nachrichten.filter((n) => n.art === "umfrage").length,
    angeheftet: nachrichten.filter((n) => n.angeheftet).length,
  };
  const stelle = (aenderung: { stumm?: boolean; angeheftet?: boolean }) =>
    einstellung.mutate({ art: chat.art, id: chat.id, ...aenderung });

  return (
    <div
      data-testid="info-panel"
      className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4"
    >
      <div className="flex flex-col items-center gap-1 text-center">
        <ChatAvatar
          name={chat.name}
          art={chat.art}
          photo={chat.partner?.photo}
          online={chat.online}
          groesse="lg"
        />
        <h2 className="font-display text-xl text-text-primary">{chat.name}</h2>
        <p className="text-xs text-text-tertiary">
          {chat.art === "direkt"
            ? chat.online
              ? t("chats.online")
              : t("chats.person")
            : t("chats.mitglieder_anzahl", { count: chat.anzahl_mitglieder })}
        </p>
        {gruppe.data?.description && (
          <p className="text-sm text-text-secondary">{gruppe.data.description}</p>
        )}
      </div>

      <div className="flex gap-2">
        <Schalter
          testid="schalter-stumm"
          an={chat.stumm}
          onText={t("chats.stumm_aus")}
          offText={t("chats.stumm_an")}
          onIcon={<IconBell size={16} />}
          offIcon={<IconBellOff size={16} />}
          onClick={() => stelle({ stumm: !chat.stumm })}
        />
        <Schalter
          testid="schalter-anheften"
          an={chat.angeheftet}
          onText={t("chats.loesen")}
          offText={t("chats.anheften")}
          onIcon={<IconPinnedOff size={16} />}
          offIcon={<IconPin size={16} />}
          onClick={() => stelle({ angeheftet: !chat.angeheftet })}
        />
      </div>

      {chat.reise && (
        <Link to={`/reisen/${chat.reise.id}`} className={`${KNOPF_LEISE} justify-start`}>
          <IconPlane size={16} aria-hidden="true" />
          {t("chats.zum_reiseraum")}: {chat.reise.titel}
        </Link>
      )}

      {hatMitglieder && (
        <section>
          <h3 className="mb-1 text-[11px] font-bold uppercase tracking-widest text-text-tertiary">
            {t("chats.mitglieder")}
          </h3>
          <ul>
            {(mitglieder.data ?? []).map((m) => (
              <li key={m.id} className="flex items-center gap-2 py-1.5">
                <ChatAvatar name={`${m.prenom} ${m.nom}`} photo={m.photo} groesse="sm" />
                <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                  {m.prenom} {m.nom}
                </span>
                {m.ist_ersteller && (
                  <span className="rounded-full bg-cal px-2 text-[10px] font-bold text-cad">
                    {t("chats.ersteller")}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {istGruppe && (
            <>
              <button
                type="button"
                onClick={() => setHinzu((h) => !h)}
                aria-expanded={hinzu}
                className={`${KNOPF_LEISE} mt-1 w-full`}
              >
                <IconUserPlus size={16} />
                {t("chats.personen_hinzufuegen")}
              </button>
              {hinzu && (
                <Hinzufuegen
                  gruppeId={chat.id}
                  vorhanden={new Set((mitglieder.data ?? []).map((m) => m.id))}
                />
              )}
            </>
          )}
        </section>
      )}

      <section>
        <h3 className="mb-1 text-[11px] font-bold uppercase tracking-widest text-text-tertiary">
          {t("chats.geteilt")}
        </h3>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          {(["gif", "treffpunkt", "umfrage", "angeheftet"] as const).map((k) => (
            <div key={k} className="rounded-cid bg-bg-secondary px-3 py-2">
              <dt className="text-xs text-text-tertiary">{t(`chats.geteilt_${k}`)}</dt>
              <dd className="font-bold text-text-primary">{geteilt[k]}</dd>
            </div>
          ))}
        </dl>
      </section>

      {istGruppe && (
        <section className="mt-auto space-y-2">
          {bestaetige === null && (
            <>
              <button
                type="button"
                onClick={() => setBestaetige("verlassen")}
                className="w-full text-left text-sm font-semibold text-status-dangerText hover:underline"
              >
                {t("chats.gruppe_verlassen")}
              </button>
              {gruppe.data?.est_createur && (
                <button
                  type="button"
                  onClick={() => setBestaetige("loeschen")}
                  className="w-full text-left text-sm font-semibold text-status-dangerText hover:underline"
                >
                  {t("chats.gruppe_loeschen")}
                </button>
              )}
            </>
          )}
          {bestaetige && (
            <div
              role="alertdialog"
              className="rounded-cid-lg border border-status-dangerText/40 p-3"
            >
              <p className="mb-2 text-sm text-text-primary">
                {bestaetige === "verlassen"
                  ? t("chats.verlassen_frage")
                  : t("chats.loeschen_frage")}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    (bestaetige === "verlassen" ? verlassen : loeschen).mutate(chat.id, {
                      onSuccess: onWeg,
                    })
                  }
                  className="inline-flex min-h-[40px] flex-1 items-center justify-center rounded-cid bg-status-dangerText px-3 text-sm font-semibold text-white"
                >
                  {bestaetige === "verlassen" ? t("chats.verlassen") : t("chats.loeschen")}
                </button>
                <button
                  type="button"
                  onClick={() => setBestaetige(null)}
                  className={`${KNOPF_LEISE} flex-1`}
                >
                  {t("chats.abbrechen")}
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
