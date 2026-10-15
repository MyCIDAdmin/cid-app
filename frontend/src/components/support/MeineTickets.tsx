/** „Meine Tickets“ : Liste der eigenen Anfragen und Formular für ein neues Ticket. */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useMeineTickets, useTicketEroeffnen } from "../../hooks/useSupport";
import { TICKET_KATEGORIEN, type TicketKategorie } from "../../types/support";
import { datumZeit, FELD, KNOPF, KNOPF_LEISE } from "./gemeinsam";
import StatusMarke from "./StatusMarke";

function NeuesTicket({
  onFertig,
  onAbbruch,
}: {
  onFertig: (id: number) => void;
  onAbbruch: () => void;
}) {
  const { t } = useTranslation("support");
  const [betreff, setBetreff] = useState("");
  const [kategorie, setKategorie] = useState<TicketKategorie>("sonstiges");
  const [text, setText] = useState("");
  const eroeffnen = useTicketEroeffnen();
  const code = (eroeffnen.error as { response?: { data?: { detail?: string } } } | null)?.response
    ?.data?.detail;
  const gueltig = betreff.trim().length > 0 && text.trim().length > 0;

  return (
    <form
      className="flex flex-col gap-3 rounded-cid-lg bg-bg-primary p-4 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        eroeffnen.mutate(
          { betreff: betreff.trim(), kategorie, text: text.trim() },
          { onSuccess: (neu) => onFertig(neu.id) },
        );
      }}
    >
      <h2 className="text-base font-bold text-text-primary">{t("ticket.neu")}</h2>
      <p className="text-xs text-text-tertiary">{t("ticket.datenschutz")}</p>
      <label className="text-xs font-semibold text-text-tertiary">
        {t("ticket.betreff")}
        <input
          className={`${FELD} mt-1`}
          maxLength={150}
          value={betreff}
          onChange={(e) => setBetreff(e.target.value)}
        />
      </label>
      <label className="text-xs font-semibold text-text-tertiary">
        {t("ticket.kategorie")}
        <select
          className={`${FELD} mt-1`}
          value={kategorie}
          onChange={(e) => setKategorie(e.target.value as TicketKategorie)}
        >
          {TICKET_KATEGORIEN.map((k) => (
            <option key={k} value={k}>
              {t(`kategorie.${k}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-semibold text-text-tertiary">
        {t("ticket.beschreibung")}
        <textarea
          className={`${FELD} mt-1 min-h-32`}
          maxLength={2000}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      {eroeffnen.isError && (
        <p role="alert" className="text-sm text-status-dangerText">
          {code === "zu_viele_tickets" || code === "zu_viele_offene_tickets"
            ? t(`ticket.${code}`)
            : t("ticket.fehler")}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className={KNOPF} disabled={!gueltig || eroeffnen.isPending}>
          {t("ticket.absenden")}
        </button>
        <button type="button" className={KNOPF_LEISE} onClick={onAbbruch}>
          {t("abbrechen")}
        </button>
      </div>
    </form>
  );
}

export default function MeineTickets({
  neu,
  setNeu,
  onOeffnen,
}: {
  neu: boolean;
  setNeu: (v: boolean) => void;
  onOeffnen: (id: number) => void;
}) {
  const { t, i18n } = useTranslation("support");
  const { data, isLoading, isError } = useMeineTickets();

  if (neu)
    return (
      <NeuesTicket
        onFertig={(id) => {
          setNeu(false);
          onOeffnen(id);
        }}
        onAbbruch={() => setNeu(false)}
      />
    );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-text-primary">{t("tab.tickets")}</h2>
        <button type="button" className={KNOPF} onClick={() => setNeu(true)}>
          {t("ticket.neu")}
        </button>
      </div>
      {isLoading && <p className="text-sm text-text-tertiary">{t("laden")}</p>}
      {isError && <p className="text-sm text-status-dangerText">{t("fehler_laden")}</p>}
      {data && data.length === 0 && (
        <p className="text-sm text-text-tertiary">{t("ticket.keine")}</p>
      )}
      <ul className="flex flex-col gap-2">
        {(data ?? []).map((tk) => (
          <li key={tk.id}>
            <button
              type="button"
              onClick={() => onOeffnen(tk.id)}
              className="flex w-full flex-col gap-1 rounded-cid border border-text-tertiary/15 bg-bg-primary p-3 text-left hover:bg-bg-secondary"
            >
              <span className="text-sm font-semibold text-text-primary">
                #{tk.id} · {tk.betreff}
              </span>
              <span className="flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
                <StatusMarke status={tk.status} />
                <span>{t(`kategorie.${tk.kategorie}`)}</span>
                <span>{datumZeit(tk.updated_at, i18n.language)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
