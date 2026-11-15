/**
 * Meldungen zu einem freien Gesuch („Hilfe gesucht“): Die Ersteller·in empfiehlt, eine Person mit
 * dem Recht „Meldungen genehmigen“ (z. B. Büro) entscheidet verbindlich. Erst die Genehmigung
 * macht die Zusage gültig ; danach geht die Nachricht an die Person (Glocke, Mail, Telegram).
 */
import { useTranslation } from "react-i18next";

import {
  useBewerbungEmpfehlen,
  useBewerbungEntscheiden,
  useBewerbungen,
} from "../../hooks/useProjets";
import type { ProjetStelle } from "../../types/projets";

const KNOPF = "rounded-cid px-2 py-1 text-xs font-medium disabled:opacity-40";

export default function MeldungenPanel({
  stelle,
  darfGenehmigen,
}: {
  stelle: ProjetStelle;
  darfGenehmigen: boolean;
}) {
  const { t } = useTranslation("projets");
  const bewerbungen = useBewerbungen(stelle.id);
  const empfehlen = useBewerbungEmpfehlen();
  const entscheiden = useBewerbungEntscheiden();
  const liste = bewerbungen.data ?? [];
  const arbeitet = empfehlen.isPending || entscheiden.isPending;

  if (liste.length === 0) {
    return <p className="text-xs text-text-tertiary">{t("hilfe.keine_meldungen")}</p>;
  }
  return (
    <ul className="space-y-1" data-testid="hilfe-meldungen">
      {liste.map((b) => {
        const name = b.membre_detail ? `${b.membre_detail.prenom} ${b.membre_detail.nom}` : "";
        const wartet = b.status === "offen" || b.status === "empfohlen";
        return (
          <li
            key={b.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-cid bg-bg-secondary px-2 py-1.5 text-sm"
          >
            <span className="min-w-0">
              <span className="font-medium text-text-primary">{name}</span>
              {b.nachricht && (
                <span className="ml-2 text-xs text-text-secondary">„{b.nachricht}“</span>
              )}
              {b.status === "empfohlen" && (
                <span className="ml-2 rounded-full bg-ca/10 px-2 py-0.5 text-[11px] font-medium text-ca">
                  {t("hilfe.empfohlen_von", { name: b.empfohlen_von_name || "—" })}
                </span>
              )}
            </span>
            {wartet ? (
              <span className="flex flex-wrap gap-2">
                {b.status === "offen" && (
                  <button
                    type="button"
                    disabled={arbeitet}
                    onClick={() => empfehlen.mutate(b.id)}
                    className={`${KNOPF} border border-ca text-ca hover:bg-ca/10`}
                  >
                    {t("hilfe.empfehlen")}
                  </button>
                )}
                {darfGenehmigen && (
                  <>
                    <button
                      type="button"
                      disabled={arbeitet || stelle.freie_plaetze === 0}
                      onClick={() => entscheiden.mutate({ id: b.id, entscheidung: "annehmen" })}
                      className={`${KNOPF} bg-ca text-white`}
                    >
                      {t("hilfe.genehmigen")}
                    </button>
                    <button
                      type="button"
                      disabled={arbeitet}
                      onClick={() => entscheiden.mutate({ id: b.id, entscheidung: "ablehnen" })}
                      className={`${KNOPF} border border-text-tertiary/40 text-text-secondary`}
                    >
                      {t("stellen.ablehnen")}
                    </button>
                  </>
                )}
                {!darfGenehmigen && b.status === "empfohlen" && (
                  <span className="text-xs text-text-tertiary">
                    {t("hilfe.wartet_auf_freigabe")}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-xs text-text-tertiary">
                {t(`stellen.status_bewerbung.${b.status}`)}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
