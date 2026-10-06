import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useAufgabeVerschieben } from "../../../hooks/useProjets";
import type { Aufgabe, ProjetMitglied, StatutAufgabe } from "../../../types/projets";
import { STATUS_REIHENFOLGE } from "./konstanten";

const PRIO_STIL: Record<string, string> = {
  hoch: "bg-status-dangerBg text-status-dangerText",
  normal: "bg-bg-tertiary text-text-secondary",
  niedrig: "bg-status-infoBg text-status-infoText",
};

function datum(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

function name(m: { prenom: string; nom: string } | null): string {
  return m ? `${m.prenom} ${m.nom}` : "";
}

/**
 * Tableau Kanban + vue liste des tâches d'un projet (2026-10-06). Glisser-déposer natif HTML5
 * (pas de dépendance supplémentaire) ; chaque carte a aussi un sélecteur de statut — accessible
 * au clavier et utilisable sur mobile, où le glisser-déposer natif n'existe pas.
 */
export default function KanbanBoard({
  aufgaben,
  team,
  bearbeitbar,
  onOeffnen,
  onNeu,
}: {
  aufgaben: Aufgabe[];
  team: ProjetMitglied[];
  bearbeitbar: boolean;
  onOeffnen: (aufgabe: Aufgabe) => void;
  onNeu: (status: StatutAufgabe) => void;
}) {
  const { t } = useTranslation("projets");
  const verschieben = useAufgabeVerschieben();
  const [ansicht, setAnsicht] = useState<"board" | "liste">("board");
  const [filter, setFilter] = useState("");
  const [ziehend, setZiehend] = useState<string | null>(null);

  const sichtbar = aufgaben.filter((a) =>
    filter === ""
      ? true
      : filter === "none"
        ? a.verantwortlich === null
        : a.verantwortlich === filter,
  );

  function spalte(status: StatutAufgabe): Aufgabe[] {
    return sichtbar
      .filter((a) => a.status === status)
      .sort((a, b) => a.ordre - b.ordre || a.created_at.localeCompare(b.created_at));
  }

  function ablegen(status: StatutAufgabe, vorAufgabe: Aufgabe | null) {
    if (!ziehend || !bearbeitbar) return;
    const andere = spalte(status).filter((a) => a.id !== ziehend);
    const position = vorAufgabe ? andere.findIndex((a) => a.id === vorAufgabe.id) : andere.length;
    verschieben.mutate({ id: ziehend, status, position: Math.max(position, 0) });
    setZiehend(null);
  }

  function statusSelect(aufgabe: Aufgabe) {
    return (
      <select
        aria-label={t("arbeitsbereich.aufgaben.status_aendern", { titel: aufgabe.titel })}
        value={aufgabe.status}
        disabled={!bearbeitbar}
        onChange={(e) =>
          verschieben.mutate({
            id: aufgabe.id,
            status: e.target.value as StatutAufgabe,
            position: spalte(e.target.value as StatutAufgabe).length,
          })
        }
        className="rounded-cid border border-text-tertiary/30 px-1 py-0.5 text-xs"
      >
        {STATUS_REIHENFOLGE.map((s) => (
          <option key={s} value={s}>
            {t(`arbeitsbereich.status.${s}`)}
          </option>
        ))}
      </select>
    );
  }

  function meta(aufgabe: Aufgabe) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-text-tertiary">
        <span className={`rounded-full px-1.5 py-0.5 font-medium ${PRIO_STIL[aufgabe.prioritaet]}`}>
          {t(`arbeitsbereich.prioritaet.${aufgabe.prioritaet}`)}
        </span>
        {aufgabe.frist && (
          <span className={aufgabe.ueberfaellig ? "font-medium text-status-dangerText" : ""}>
            {aufgabe.ueberfaellig
              ? t("arbeitsbereich.aufgaben.ueberfaellig", { datum: datum(aufgabe.frist) })
              : t("arbeitsbereich.aufgaben.frist", { datum: datum(aufgabe.frist) })}
          </span>
        )}
        {aufgabe.verantwortlich_detail && <span>{name(aufgabe.verantwortlich_detail)}</span>}
        {aufgabe.kommentare_anzahl > 0 && (
          <span>
            {t("arbeitsbereich.aufgaben.kommentare", { count: aufgabe.kommentare_anzahl })}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <select
            aria-label={t("arbeitsbereich.aufgaben.filter_verantwortlich")}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
          >
            <option value="">{t("arbeitsbereich.aufgaben.alle_verantwortlichen")}</option>
            <option value="none">{t("arbeitsbereich.aufgaben.nicht_zugewiesen")}</option>
            {team.map((m) => (
              <option key={m.membre} value={m.membre}>
                {name(m.membre_detail)}
              </option>
            ))}
          </select>
          <div className="flex overflow-hidden rounded-cid border border-text-tertiary/30 text-sm">
            {(["board", "liste"] as const).map((a) => (
              <button
                key={a}
                type="button"
                aria-pressed={ansicht === a}
                onClick={() => setAnsicht(a)}
                className={`px-2 py-1 ${ansicht === a ? "bg-ca text-white" : "text-text-secondary"}`}
              >
                {t(`arbeitsbereich.aufgaben.ansicht_${a}`)}
              </button>
            ))}
          </div>
        </div>
        {bearbeitbar && (
          <button
            type="button"
            onClick={() => onNeu("offen")}
            className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white"
          >
            {t("arbeitsbereich.aufgaben.neu")}
          </button>
        )}
      </div>

      {ansicht === "board" ? (
        <div className="grid gap-3 md:grid-cols-4">
          {STATUS_REIHENFOLGE.map((status) => {
            const eintraege = spalte(status);
            return (
              <section
                key={status}
                aria-label={t(`arbeitsbereich.status.${status}`)}
                onDragOver={(e) => bearbeitbar && e.preventDefault()}
                onDrop={() => ablegen(status, null)}
                className="min-h-24 rounded-cid-lg bg-bg-secondary p-2"
              >
                <div className="mb-2 flex items-center justify-between px-1">
                  <h3 className="text-xs font-semibold uppercase text-text-secondary">
                    {t(`arbeitsbereich.status.${status}`)} ({eintraege.length})
                  </h3>
                  {bearbeitbar && (
                    <button
                      type="button"
                      aria-label={t("arbeitsbereich.aufgaben.neu_in", {
                        status: t(`arbeitsbereich.status.${status}`),
                      })}
                      onClick={() => onNeu(status)}
                      className="text-lg leading-none text-text-tertiary hover:text-ca"
                    >
                      +
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {eintraege.length === 0 && (
                    <p className="px-1 text-xs text-text-tertiary">
                      {t("arbeitsbereich.aufgaben.spalte_leer")}
                    </p>
                  )}
                  {eintraege.map((aufgabe) => (
                    <article
                      key={aufgabe.id}
                      draggable={bearbeitbar}
                      onDragStart={() => setZiehend(aufgabe.id)}
                      onDragEnd={() => setZiehend(null)}
                      onDragOver={(e) => bearbeitbar && e.preventDefault()}
                      onDrop={(e) => {
                        e.stopPropagation();
                        ablegen(status, aufgabe);
                      }}
                      className={`space-y-1.5 rounded-cid bg-bg-primary p-2 shadow-sm ${
                        ziehend === aufgabe.id ? "opacity-50" : ""
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onOeffnen(aufgabe)}
                        className="block w-full text-left text-sm font-medium text-text-primary hover:text-ca"
                      >
                        {aufgabe.titel}
                      </button>
                      {meta(aufgabe)}
                      {statusSelect(aufgabe)}
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {sichtbar.length === 0 && (
            <p className="text-sm text-text-tertiary">{t("arbeitsbereich.aufgaben.leer")}</p>
          )}
          {[...sichtbar]
            .sort((a, b) => (a.frist ?? "9999").localeCompare(b.frist ?? "9999"))
            .map((aufgabe) => (
              <div
                key={aufgabe.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-cid bg-bg-primary p-2 shadow-sm"
              >
                <div className="min-w-0 space-y-1">
                  <button
                    type="button"
                    onClick={() => onOeffnen(aufgabe)}
                    className="text-left text-sm font-medium text-text-primary hover:text-ca"
                  >
                    {aufgabe.titel}
                  </button>
                  {meta(aufgabe)}
                </div>
                {statusSelect(aufgabe)}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
