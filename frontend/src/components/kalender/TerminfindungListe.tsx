/**
 * Offene Terminfindungen „Wann passt es euch?“ (Release 18) : Teilnehmer antworten je Vorschlag
 * mit Ja / Vielleicht / Nein ; wer Termine pflegt, sieht die Namen und wählt den Termin aus —
 * daraus entsteht der Kalendereintrag samt Einladungen.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useUmfrageAbbrechen,
  useUmfrageAbstimmen,
  useUmfrageEntscheiden,
  useUmfragen,
} from "../../hooks/useKalender";
import { STIMM_ANTWORTEN, type StimmAntwort, type Terminumfrage } from "../../types/kalender";
import { extractApiErrorMessage } from "../../utils/apiError";

const KNOPF = "rounded-cid border border-text-tertiary/30 px-2 py-0.5 text-xs font-semibold";

function Umfrage({ umfrage }: { umfrage: Terminumfrage }) {
  const { t, i18n } = useTranslation("kalender");
  const abstimmen = useUmfrageAbstimmen();
  const entscheiden = useUmfrageEntscheiden();
  const abbrechen = useUmfrageAbbrechen();
  const [auswahl, setAuswahl] = useState<Record<string, StimmAntwort>>({});
  const [fehler, setFehler] = useState("");

  function ausfuehren(promise: Promise<unknown>) {
    setFehler("");
    promise.catch((e) => setFehler(extractApiErrorMessage(e, t("fehler_aktion"))));
  }

  const antwort = (optionId: string, meine: StimmAntwort | null) => auswahl[optionId] ?? meine;
  const offen = umfrage.status === "offen";

  return (
    <li className="rounded-cid border border-text-tertiary/20 p-2" data-testid="terminfindung">
      <p className="text-sm font-semibold text-text-primary">{umfrage.titel}</p>
      <p className="text-xs text-text-secondary">
        {umfrage.erstellt_von_name}
        {umfrage.ort && ` · ${umfrage.ort}`}
        {umfrage.antwort_bis && ` · ${t("findung.antwort_bis")} ${umfrage.antwort_bis}`}
      </p>
      <ul className="mt-2 space-y-1">
        {umfrage.optionen.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="min-w-0">
              {new Date(o.beginn).toLocaleString(i18n.language, {
                weekday: "short",
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
              <span className="ms-2 text-xs text-text-tertiary">
                ✓{o.ja} ?{o.vielleicht} ✗{o.nein}
              </span>
              {o.stimmen.length > 0 && (
                <span className="block text-xs text-text-tertiary">
                  {o.stimmen
                    .map((s) => `${s.name}: ${t(`findung.antwort.${s.antwort}`)}`)
                    .join(" · ")}
                </span>
              )}
            </span>
            <span className="flex gap-1">
              {offen &&
                umfrage.bin_teilnehmer &&
                STIMM_ANTWORTEN.map((a) => (
                  <button
                    key={a}
                    type="button"
                    aria-pressed={antwort(o.id, o.meine_antwort) === a}
                    onClick={() => setAuswahl((s) => ({ ...s, [o.id]: a }))}
                    className={`${KNOPF} ${
                      antwort(o.id, o.meine_antwort) === a ? "bg-ca text-white" : ""
                    }`}
                  >
                    {t(`findung.antwort.${a}`)}
                  </button>
                ))}
              {umfrage.darf_entscheiden && (
                <button
                  type="button"
                  className={`${KNOPF} bg-status-successBg text-status-successText`}
                  onClick={() =>
                    ausfuehren(entscheiden.mutateAsync({ id: umfrage.id, option: o.id }))
                  }
                >
                  {t("findung.waehlen")}
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap gap-2">
        {offen && umfrage.bin_teilnehmer && Object.keys(auswahl).length > 0 && (
          <button
            type="button"
            className={`${KNOPF} bg-ca text-white`}
            disabled={abstimmen.isPending}
            onClick={() =>
              ausfuehren(
                abstimmen
                  .mutateAsync({ id: umfrage.id, stimmen: auswahl })
                  .then(() => setAuswahl({})),
              )
            }
          >
            {t("findung.antwort_senden")}
          </button>
        )}
        {umfrage.darf_entscheiden && (
          <button
            type="button"
            className={`${KNOPF} text-status-dangerText`}
            onClick={() => ausfuehren(abbrechen.mutateAsync(umfrage.id))}
          >
            {t("findung.abbrechen")}
          </button>
        )}
      </div>
      {fehler && <p className="mt-1 text-xs text-status-dangerText">{fehler}</p>}
    </li>
  );
}

export default function TerminfindungListe() {
  const { t } = useTranslation("kalender");
  const umfragen = useUmfragen();
  const offene = (umfragen.data ?? []).filter((u) => u.status === "offen");
  if (umfragen.isError || offene.length === 0) return null;
  return (
    <section
      className="rounded-cid-lg border border-ca/30 bg-ca/5 p-3"
      data-testid="terminfindungen"
    >
      <h2 className="mb-2 text-sm font-semibold text-ca">{t("findung.titel")}</h2>
      <ul className="space-y-2">
        {offene.map((u) => (
          <Umfrage key={u.id} umfrage={u} />
        ))}
      </ul>
    </section>
  );
}
