/** Ein Ticket mit Verlauf, Antwortfeld und (für das Büro) Status, Zuweisung und Notizen. */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useNachrichtSenden, useTicket, useTicketAendern } from "../../hooks/useSupport";
import { useAuthStore } from "../../store/authStore";
import { TICKET_STATI, type TicketDetail, type TicketStatus } from "../../types/support";
import { datumZeit, FELD, KNOPF, KNOPF_LEISE } from "./gemeinsam";
import StatusMarke from "./StatusMarke";

const ANTWORT_STATI: ReadonlyArray<TicketStatus> = [
  "wartet_auf_antwort",
  "in_bearbeitung",
  "geloest",
];

function Verlauf({ ticket }: { ticket: TicketDetail }) {
  const { t, i18n } = useTranslation("support");
  return (
    <ol className="flex flex-col gap-2" aria-label={t("ticket.verlauf")}>
      {ticket.nachrichten.map((n) => {
        const farbe = n.intern
          ? "border-status-warningText/30 bg-status-warningBg"
          : n.von_support
            ? "border-ca/30 bg-bg-secondary"
            : "border-text-tertiary/15 bg-bg-primary";
        return (
          <li key={n.id} className={`rounded-cid border p-3 ${farbe}`}>
            <p className="text-xs font-semibold text-text-tertiary">
              {n.intern
                ? t("ticket.notiz_von", { name: n.autor })
                : n.von_support
                  ? t("ticket.antwort_von", { name: n.autor || t("ticket.buero") })
                  : (ticket.name ?? t("ticket.du"))}
              {" · "}
              {datumZeit(n.created_at, i18n.language)}
            </p>
            <p className="mt-1 whitespace-pre-line text-sm text-text-primary">{n.text}</p>
          </li>
        );
      })}
    </ol>
  );
}

function Antwortfeld({ ticket, buero }: { ticket: TicketDetail; buero: boolean }) {
  const { t } = useTranslation("support");
  const [text, setText] = useState("");
  const [intern, setIntern] = useState(false);
  const [status, setStatus] = useState<TicketStatus>("wartet_auf_antwort");
  const senden = useNachrichtSenden(ticket.id);

  function absenden() {
    senden.mutate(
      { text: text.trim(), ...(buero ? { intern, ...(intern ? {} : { status }) } : {}) },
      { onSuccess: () => setText("") },
    );
  }

  if (!ticket.kann_antworten) {
    return <p className="text-sm text-text-tertiary">{t("ticket.geschlossen_hinweis")}</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-semibold text-text-tertiary" htmlFor="support-antwort">
        {t(buero && intern ? "ticket.notiz" : "ticket.antworten")}
      </label>
      <textarea
        id="support-antwort"
        className={`${FELD} min-h-24`}
        maxLength={2000}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {buero && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-text-secondary">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={intern} onChange={(e) => setIntern(e.target.checked)} />
            {t("ticket.intern")}
          </label>
          {!intern && (
            <label className="flex items-center gap-2">
              {t("ticket.danach")}
              <select
                className={`${FELD} w-auto`}
                value={status}
                onChange={(e) => setStatus(e.target.value as TicketStatus)}
              >
                {ANTWORT_STATI.map((s) => (
                  <option key={s} value={s}>
                    {t(`status.${s}`)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      {senden.isError && <p className="text-sm text-status-dangerText">{t("ticket.fehler")}</p>}
      <div>
        <button
          type="button"
          className={KNOPF}
          disabled={!text.trim() || senden.isPending}
          onClick={absenden}
        >
          {t(buero && intern ? "ticket.notiz_speichern" : "ticket.senden")}
        </button>
      </div>
    </div>
  );
}

function BueroLeiste({ ticket }: { ticket: TicketDetail }) {
  const { t } = useTranslation("support");
  const meineId = useAuthStore((s) => s.user?.id);
  const aendern = useTicketAendern(ticket.id);
  const meins = ticket.bearbeiter?.id === meineId;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-cid bg-bg-secondary p-3 text-sm">
      <label className="flex items-center gap-2 text-text-secondary">
        {t("buero.status")}
        <select
          className={`${FELD} w-auto`}
          value={ticket.status}
          onChange={(e) => aendern.mutate({ status: e.target.value as TicketStatus })}
        >
          {TICKET_STATI.map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
        </select>
      </label>
      <span className="text-text-secondary">
        {t("buero.bearbeiter")}: {ticket.bearbeiter?.name ?? t("buero.niemand")}
      </span>
      {!meins && meineId && (
        <button
          type="button"
          className={KNOPF_LEISE}
          onClick={() => aendern.mutate({ bearbeiter: meineId })}
        >
          {t("buero.mir_zuweisen")}
        </button>
      )}
      {ticket.bearbeiter && (
        <button
          type="button"
          className={KNOPF_LEISE}
          onClick={() => aendern.mutate({ bearbeiter: null })}
        >
          {t("buero.freigeben")}
        </button>
      )}
      {aendern.isError && <span className="text-status-dangerText">{t("ticket.fehler")}</span>}
    </div>
  );
}

export default function TicketAnsicht({
  id,
  buero,
  onZurueck,
}: {
  id: number;
  buero: boolean;
  onZurueck: () => void;
}) {
  const { t, i18n } = useTranslation("support");
  const { data, isLoading, isError } = useTicket(id);
  const schliessen = useTicketAendern(id);

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onZurueck}
        className="self-start text-xs font-medium text-ca hover:underline"
      >
        ← {t("ticket.zurueck")}
      </button>
      {isLoading && <p className="text-sm text-text-tertiary">{t("laden")}</p>}
      {isError && <p className="text-sm text-status-dangerText">{t("ticket.nicht_gefunden")}</p>}
      {data && (
        <>
          <div>
            <h2 className="text-lg font-bold text-text-primary">
              #{data.id} · {data.betreff}
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
              <StatusMarke status={data.status} />
              <span>{t(`kategorie.${data.kategorie}`)}</span>
              <span>{datumZeit(data.created_at, i18n.language)}</span>
              {buero && data.name && (
                <span>
                  {data.name}
                  {data.art ? ` (${t(`art.${data.art}`)})` : ""}
                </span>
              )}
            </p>
          </div>
          {buero && <BueroLeiste ticket={data} />}
          <Verlauf ticket={data} />
          <Antwortfeld ticket={data} buero={buero} />
          {!buero && data.status !== "geschlossen" && (
            <div>
              <button
                type="button"
                className={KNOPF_LEISE}
                disabled={schliessen.isPending}
                onClick={() => schliessen.mutate({ status: "geschlossen" })}
              >
                {t("ticket.schliessen")}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
