/**
 * Meilensteine eines (Dach-)Projekts (Nutzerwunsch 2026-10-20) : Liste mit Datum und Erledigt-
 * Haken. Bearbeiten (Anlegen, Abhaken, Löschen) dürfen nur Projektleitung/Verwaltung
 * (`darfVerwalten`, vom Server als `darf_team_verwalten` geliefert) und nur für Meilensteine des
 * Projekts selbst — Meilensteine der Teilprojekte werden mit ihrem Projektnamen angezeigt und
 * auf der Seite des jeweiligen Teilprojekts gepflegt (dort gilt dieselbe serverseitige Prüfung).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useCreerMeilenstein,
  useModifierMeilenstein,
  useSupprimerMeilenstein,
} from "../../hooks/useProjets";
import type { Meilenstein } from "../../types/projets";
import { extractApiErrorMessage } from "../../utils/apiError";
import ConfirmDialog from "../ui/ConfirmDialog";
import { lokaleSprache } from "../../utils/datum";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(lokaleSprache());
}

export default function MeilensteineListe({
  projetId,
  meilensteine,
  darfVerwalten,
}: {
  projetId: string;
  meilensteine: Meilenstein[];
  darfVerwalten: boolean;
}) {
  const { t } = useTranslation("projets");
  const erstellen = useCreerMeilenstein();
  const aendern = useModifierMeilenstein();
  const loeschen = useSupprimerMeilenstein();

  const [titel, setTitel] = useState("");
  const [faellig, setFaellig] = useState("");
  const [fehler, setFehler] = useState("");
  const [zuLoeschen, setZuLoeschen] = useState<Meilenstein | null>(null);

  function hinzufuegen(e: React.FormEvent) {
    e.preventDefault();
    if (!titel.trim()) return;
    setFehler("");
    erstellen.mutate(
      { projet: projetId, titel: titel.trim(), faellig_am: faellig || null },
      {
        onSuccess: () => {
          setTitel("");
          setFaellig("");
        },
        onError: (err) => setFehler(extractApiErrorMessage(err, t("dach.fehler"))),
      },
    );
  }

  function umschalten(m: Meilenstein) {
    aendern.mutate(
      { id: m.id, payload: { erledigt: !m.erledigt } },
      { onError: (err) => setFehler(extractApiErrorMessage(err, t("dach.fehler"))) },
    );
  }

  return (
    <div>
      {meilensteine.length === 0 && (
        <p className="text-sm text-text-tertiary">{t("dach.keine_meilensteine")}</p>
      )}

      <ol className="space-y-1.5">
        {meilensteine.map((m) => {
          const eigener = m.projet === projetId;
          const bearbeitbar = darfVerwalten && eigener;
          return (
            <li
              key={m.id}
              className="flex items-start gap-2 rounded-cid border border-text-tertiary/15 bg-bg-primary px-3 py-2"
            >
              {bearbeitbar ? (
                <input
                  type="checkbox"
                  checked={m.erledigt}
                  onChange={() => umschalten(m)}
                  aria-label={
                    t(m.erledigt ? "dach.als_offen_markieren" : "dach.als_erledigt_markieren", {
                      titel: m.titel,
                    }) ?? ""
                  }
                  className="mt-0.5 h-4 w-4 shrink-0 accent-ca"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${
                    m.erledigt ? "bg-ca text-white" : "border border-text-tertiary/50"
                  }`}
                >
                  {m.erledigt ? "✓" : ""}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div
                  className={`text-sm ${
                    m.erledigt ? "text-text-tertiary line-through" : "text-text-primary"
                  }`}
                >
                  {m.titel}
                </div>
                <div className="flex flex-wrap items-center gap-x-2 text-xs text-text-tertiary">
                  {!eigener && (
                    <span className="rounded-full bg-bg-tertiary px-1.5 py-0.5">
                      {m.projet_titel}
                    </span>
                  )}
                  {m.faellig_am && (
                    <span className={m.ueberfaellig ? "font-medium text-status-dangerText" : ""}>
                      {formatDate(m.faellig_am)}
                      {m.ueberfaellig && ` · ${t("dach.ueberfaellig")}`}
                    </span>
                  )}
                  {m.erledigt && m.erledigt_am && (
                    <span>{t("dach.erreicht_am", { datum: formatDate(m.erledigt_am) })}</span>
                  )}
                </div>
              </div>
              {bearbeitbar && (
                <button
                  type="button"
                  onClick={() => setZuLoeschen(m)}
                  aria-label={t("dach.loeschen_aria", { titel: m.titel }) ?? ""}
                  className="shrink-0 rounded px-1.5 text-xs text-status-dangerText hover:bg-status-dangerBg"
                >
                  ×
                </button>
              )}
            </li>
          );
        })}
      </ol>

      {darfVerwalten && (
        <form onSubmit={hinzufuegen} className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-[10rem] flex-1">
            <label
              htmlFor="meilenstein-titel"
              className="mb-1 block text-xs font-medium text-text-secondary"
            >
              {t("dach.meilenstein_titel")}
            </label>
            <input
              id="meilenstein-titel"
              type="text"
              value={titel}
              onChange={(e) => setTitel(e.target.value)}
              className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="meilenstein-datum"
              className="mb-1 block text-xs font-medium text-text-secondary"
            >
              {t("dach.meilenstein_datum")}
            </label>
            <input
              id="meilenstein-datum"
              type="date"
              value={faellig}
              onChange={(e) => setFaellig(e.target.value)}
              className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={erstellen.isPending || !titel.trim()}
            className="rounded-cid bg-ca px-3 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
          >
            {t("dach.hinzufuegen")}
          </button>
        </form>
      )}
      {fehler && <p className="mt-2 text-xs text-status-dangerText">{fehler}</p>}

      <ConfirmDialog
        open={zuLoeschen !== null}
        title={t("dach.loeschen_titel")}
        message={t("dach.loeschen_frage", { titel: zuLoeschen?.titel ?? "" })}
        danger
        onConfirm={() => {
          if (zuLoeschen) {
            loeschen.mutate(zuLoeschen.id, {
              onError: (err) => setFehler(extractApiErrorMessage(err, t("dach.fehler"))),
            });
          }
          setZuLoeschen(null);
        }}
        onCancel={() => setZuLoeschen(null)}
      />
    </div>
  );
}
