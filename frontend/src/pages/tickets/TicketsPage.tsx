/**
 * Meine Tickets : QR-Eintrittskarten für bestätigte Anmeldungen und Treffen. Das Ticket kommt
 * zusätzlich als PDF per E-Mail (und Telegram, falls im Profil verbunden), damit es auch ohne
 * Netz am Einlass vorliegt. Deep-Link aus Benachrichtigungen : /tickets?ticket=<id>.
 */
import { IconTicket } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";

import { useMeineTickets, useTicketErneuern, useTicketSenden } from "../../hooks/useTickets";
import type { Ticket } from "../../types/tickets";
import { extractApiErrorMessage } from "../../utils/apiError";

function personenText(t: (k: string, o?: Record<string, unknown>) => string, ticket: Ticket) {
  const teile = [t("personen_erwachsene", { count: ticket.erwachsene })];
  if (ticket.kinder > 0) teile.push(t("personen_kinder", { count: ticket.kinder }));
  return teile.join(", ");
}

function TicketKarte({ ticket, markiert }: { ticket: Ticket; markiert: boolean }) {
  const { t, i18n } = useTranslation("tickets");
  const senden = useTicketSenden();
  const erneuern = useTicketErneuern();
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const datum = new Date(ticket.datum).toLocaleDateString(i18n.language, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const sendeErneut = () => {
    setMeldung(null);
    setFehler(null);
    senden.mutate(ticket.id, {
      onSuccess: () => setMeldung(t("gesendet")),
      onError: (e) => setFehler(extractApiErrorMessage(e, t("fehler"))),
    });
  };
  const neuAusstellen = () => {
    setMeldung(null);
    setFehler(null);
    erneuern.mutate(ticket.id, {
      onSuccess: () => setMeldung(t("erneuert")),
      onError: (e) => setFehler(extractApiErrorMessage(e, t("fehler"))),
    });
  };

  return (
    <li
      className={`rounded-lg border bg-bg-secondary p-4 ${
        markiert ? "border-cad" : "border-text-tertiary/20"
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row">
        <img
          src={ticket.qr}
          alt={t("qr_alt", { titel: ticket.titel })}
          className="h-48 w-48 shrink-0 self-center rounded bg-white p-2"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs uppercase tracking-wide text-text-tertiary">
            {ticket.art === "treffen" ? t("art_treffen") : t("art_evenement")}
          </p>
          <h2 className="text-lg font-semibold text-text-primary">{ticket.titel}</h2>
          <p className="text-sm text-text-secondary">
            {datum}
            {ticket.uhrzeit ? `, ${ticket.uhrzeit.slice(0, 5)}` : ""}
          </p>
          {ticket.ort && <p className="text-sm text-text-secondary">{ticket.ort}</p>}
          <p className="text-sm text-text-secondary">{personenText(t, ticket)}</p>
          {ticket.name && <p className="text-sm text-text-secondary">{ticket.name}</p>}
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={sendeErneut}
              disabled={senden.isPending}
              className="rounded border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary disabled:opacity-60"
            >
              {t("erneut_senden")}
            </button>
            <button
              type="button"
              onClick={neuAusstellen}
              disabled={erneuern.isPending}
              className="rounded border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary disabled:opacity-60"
            >
              {t("erneuern")}
            </button>
          </div>
          {meldung && (
            <p role="status" className="text-sm text-status-successText">
              {meldung}
            </p>
          )}
          {fehler && (
            <p role="alert" className="text-sm text-status-dangerText">
              {fehler}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

export default function TicketsPage() {
  const { t } = useTranslation("tickets");
  const [params] = useSearchParams();
  const markiert = params.get("ticket");
  const { data, isLoading, isError } = useMeineTickets();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="flex items-center gap-2 text-xl font-semibold text-text-primary">
        <IconTicket size={22} />
        {t("titel")}
      </h1>
      <p className="text-sm text-text-secondary">{t("hinweis_offline")}</p>
      {data && !data.telegram_verbunden && (
        <p className="text-sm text-text-tertiary">
          {t("hinweis_telegram")}{" "}
          <Link to="/mon-profil?onglet=einstellungen" className="underline">
            {t("zu_einstellungen")}
          </Link>
        </p>
      )}
      {isLoading && <p className="text-sm text-text-secondary">{t("laedt")}</p>}
      {isError && (
        <p role="alert" className="text-sm text-status-dangerText">
          {t("fehler")}
        </p>
      )}
      {data && data.tickets.length === 0 && (
        <p className="text-sm text-text-secondary">{t("leer")}</p>
      )}
      {data && data.tickets.length > 0 && (
        <ul className="space-y-4">
          {data.tickets.map((ticket) => (
            <TicketKarte key={ticket.id} ticket={ticket} markiert={markiert === ticket.id} />
          ))}
        </ul>
      )}
    </div>
  );
}
