/**
 * Support (Release 33) : häufige Fragen, Anleitungen und Tickets an das Büro. Das Büro
 * (Seite „Support“ mit Schreibrecht) sieht zusätzlich alle Tickets und pflegt die Fragen.
 * Deep-Link aus Benachrichtigungen : /support?ticket=<Nummer>.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import BueroTickets from "../../components/support/BueroTickets";
import FaqBereich from "../../components/support/FaqBereich";
import FaqVerwaltung from "../../components/support/FaqVerwaltung";
import MeineTickets from "../../components/support/MeineTickets";
import TicketAnsicht from "../../components/support/TicketAnsicht";
import { usePageAccess } from "../../hooks/useRbac";

type Tab = "hilfe" | "tickets" | "buero" | "faq";

export default function SupportPage() {
  const { t } = useTranslation("support");
  const { modifiable: buero } = usePageAccess("page_support");
  const [params, setParams] = useSearchParams();
  const ticketParam = Number(params.get("ticket"));
  const ticketId = Number.isInteger(ticketParam) && ticketParam > 0 ? ticketParam : null;
  const [gewaehlt, setTab] = useState<Tab>("hilfe");
  const [neu, setNeu] = useState(false);
  // Ein geöffnetes Ticket gehört zur Liste, aus der man es öffnet (Büro : alle Tickets).
  const tab: Tab = ticketId !== null ? (buero ? "buero" : "tickets") : gewaehlt;

  const tabs: Tab[] = buero ? ["hilfe", "tickets", "buero", "faq"] : ["hilfe", "tickets"];
  const wechsle = (naechster: Tab) => {
    setTab(naechster);
    setNeu(false);
    if (ticketId !== null) setParams({}, { replace: true });
  };
  const oeffne = (id: number) => {
    setTab(buero ? "buero" : "tickets");
    setParams({ ticket: String(id) });
  };
  const zurueck = () => setParams({}, { replace: true });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-text-primary">{t("titel")}</h1>
        <p className="text-sm text-text-secondary">{t("einleitung")}</p>
      </div>

      <div role="tablist" className="flex flex-wrap gap-2">
        {tabs.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => wechsle(id)}
            className={`rounded-cid px-3 py-2 text-sm font-semibold ${
              tab === id
                ? "bg-ca text-white"
                : "bg-bg-primary text-text-secondary hover:bg-bg-secondary"
            }`}
          >
            {t(`tab.${id}`)}
          </button>
        ))}
      </div>

      {ticketId !== null ? (
        <TicketAnsicht id={ticketId} buero={buero} onZurueck={zurueck} />
      ) : tab === "hilfe" ? (
        <FaqBereich
          onTicket={() => {
            setNeu(true);
            setTab("tickets");
          }}
        />
      ) : tab === "tickets" ? (
        <MeineTickets neu={neu} setNeu={setNeu} onOeffnen={oeffne} />
      ) : tab === "buero" && buero ? (
        <BueroTickets onOeffnen={oeffne} />
      ) : tab === "faq" && buero ? (
        <FaqVerwaltung />
      ) : null}
    </div>
  );
}
