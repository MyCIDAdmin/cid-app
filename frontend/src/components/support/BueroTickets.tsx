/** Büro : alle Tickets mit Filter und Suche. */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useAlleTickets } from "../../hooks/useSupport";
import { TICKET_STATI, type TicketFilter } from "../../types/support";
import { datumZeit, FELD } from "./gemeinsam";
import StatusMarke from "./StatusMarke";

export default function BueroTickets({ onOeffnen }: { onOeffnen: (id: number) => void }) {
  const { t, i18n } = useTranslation("support");
  const [filter, setFilter] = useState<TicketFilter>({ status: "aktiv", q: "" });
  const { data, isLoading, isError } = useAlleTickets(filter, true);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <select
          aria-label={t("buero.status")}
          className={`${FELD} w-auto`}
          value={filter.status}
          onChange={(e) =>
            setFilter({ ...filter, status: e.target.value as TicketFilter["status"] })
          }
        >
          <option value="aktiv">{t("buero.filter_aktiv")}</option>
          <option value="alle">{t("buero.filter_alle")}</option>
          {TICKET_STATI.map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
        </select>
        <input
          type="search"
          className={`${FELD} w-auto min-w-48 flex-1`}
          placeholder={t("buero.suche")}
          aria-label={t("buero.suche")}
          value={filter.q}
          onChange={(e) => setFilter({ ...filter, q: e.target.value })}
        />
      </div>
      {isLoading && <p className="text-sm text-text-tertiary">{t("laden")}</p>}
      {isError && <p className="text-sm text-status-dangerText">{t("fehler_laden")}</p>}
      {data && data.length === 0 && (
        <p className="text-sm text-text-tertiary">{t("buero.keine")}</p>
      )}
      {data && data.length > 0 && (
        <div className="overflow-x-auto rounded-cid-lg bg-bg-primary shadow-sm">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-text-tertiary">
              <tr>
                <th scope="col" className="px-3 py-2">
                  #
                </th>
                <th scope="col" className="px-3 py-2">
                  {t("ticket.betreff")}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t("buero.von")}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t("buero.status")}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t("buero.bearbeiter")}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t("buero.aktualisiert")}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((tk) => (
                <tr key={tk.id} className="border-t border-text-tertiary/10">
                  <td className="px-3 py-2">{tk.id}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="text-left font-medium text-ca hover:underline"
                      onClick={() => onOeffnen(tk.id)}
                    >
                      {tk.betreff}
                    </button>
                    <div className="text-xs text-text-tertiary">
                      {t(`kategorie.${tk.kategorie}`)}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {tk.name}
                    {tk.art ? (
                      <div className="text-xs text-text-tertiary">{t(`art.${tk.art}`)}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <StatusMarke status={tk.status} />
                  </td>
                  <td className="px-3 py-2">{tk.bearbeiter?.name ?? "–"}</td>
                  <td className="px-3 py-2">{datumZeit(tk.updated_at, i18n.language)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
