/**
 * Detailansicht eines Kalendereintrags (Release 15) : Zeit, Ort, Beschreibung, Zu-/Absage bei
 * Einladung, für die Verwaltung außerdem Freigabe, Ankündigung, Bearbeiten und Löschen.
 * Einträge aus anderen Modulen (Veranstaltung, Aufgabe, Umfrage …) verlinken ins jeweilige Modul.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import {
  useTermin,
  useTerminAktion,
  useTerminAntworten,
  useTerminLoeschen,
} from "../../hooks/useKalender";
import { useEscapeSchliessen } from "../../hooks/useEscapeSchliessen";
import type { KalenderEintrag, KalenderZugang, Termin } from "../../types/kalender";
import { extractApiErrorMessage } from "../../utils/apiError";
import { formatZeit } from "../../utils/kalender";
import { uebersetzt } from "../../utils/uebersetzung";
import ConfirmDialog from "../ui/ConfirmDialog";

interface Props {
  eintrag: KalenderEintrag;
  zugang: KalenderZugang | undefined;
  onSchliessen: () => void;
  onBearbeiten: (termin: Termin) => void;
}

const KNOPF = "rounded-cid border border-text-tertiary/30 px-3 py-1 text-xs font-semibold";

export default function TerminDialog({ eintrag, zugang, onSchliessen, onBearbeiten }: Props) {
  const { t, i18n } = useTranslation("kalender");
  useEscapeSchliessen(onSchliessen);
  const istTermin = eintrag.quelle === "termin";
  const detail = useTermin(istTermin ? eintrag.termin_id : undefined);
  const termin = detail.data;
  const aktion = useTerminAktion();
  const antworten = useTerminAntworten();
  const loeschen = useTerminLoeschen();
  const [fehler, setFehler] = useState("");
  const [loeschenFrage, setLoeschenFrage] = useState(false);
  const schreiben = Boolean(zugang?.schreiben) && istTermin;

  function ausfuehren(promise: Promise<unknown>, nachher?: () => void) {
    setFehler("");
    promise.then(nachher).catch((e) => setFehler(extractApiErrorMessage(e, t("fehler_aktion"))));
  }

  const status = termin?.status ?? eintrag.status;
  const meineAntwort = termin?.meine_antwort ?? eintrag.meine_antwort ?? null;
  const kannAnkuendigen =
    schreiben &&
    termin &&
    termin.status === "freigegeben" &&
    !termin.publikation &&
    (termin.sichtbarkeit === "mitglieder" || termin.sichtbarkeit === "oeffentlich");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="termin-dialog-titel"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-cid-lg bg-bg-primary p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h2 id="termin-dialog-titel" className="text-base font-semibold text-text-primary">
            {eintrag.wichtig && "★ "}
            {uebersetzt(eintrag, "titel")}
          </h2>
          <button
            type="button"
            onClick={onSchliessen}
            aria-label={t("schliessen")}
            className="text-text-tertiary"
          >
            ✕
          </button>
        </div>
        <p className="mt-1 text-xs text-text-secondary">
          {t(`kategorie.${eintrag.kategorie}`)} · {formatZeit(eintrag, i18n.language)}
          {eintrag.wiederholung !== "keine" && ` · ${t(`wiederholung.${eintrag.wiederholung}`)}`}
        </p>
        {status === "vorgeschlagen" && (
          <p className="mt-2 rounded bg-status-warningBg px-2 py-1 text-xs text-status-warningText">
            {t("status.vorgeschlagen_hinweis")}
          </p>
        )}
        {eintrag.ort && (
          <p className="mt-3 text-sm text-text-primary">
            📍 {uebersetzt(eintrag, "ort") || eintrag.ort}
          </p>
        )}
        {eintrag.beschreibung && (
          <p className="mt-2 whitespace-pre-line text-sm text-text-primary">
            {uebersetzt(eintrag, "beschreibung")}
          </p>
        )}
        {istTermin && eintrag.link && (
          <p className="mt-2 text-sm">
            <a
              href={eintrag.link}
              target="_blank"
              rel="noreferrer noopener"
              className="text-ca underline"
            >
              {t("link_oeffnen")}
            </a>
          </p>
        )}
        {istTermin && eintrag.sichtbarkeit && (
          <p className="mt-2 text-xs text-text-tertiary">
            {t(`sichtbarkeit.${eintrag.sichtbarkeit}`)}
            {eintrag.kreis ? ` · ${t(`kreis.${eintrag.kreis}`)}` : ""}
            {eintrag.projekt_titel ? ` · ${eintrag.projekt_titel}` : ""}
          </p>
        )}
        {!istTermin && eintrag.link && (
          <p className="mt-3 text-sm">
            <Link to={eintrag.link} className="text-ca underline" onClick={onSchliessen}>
              {t("im_modul_oeffnen")}
            </Link>
          </p>
        )}

        {meineAntwort !== null && termin && (
          <div className="mt-4">
            <p className="mb-1 text-xs font-bold text-text-tertiary">{t("meine_antwort")}</p>
            <div className="flex flex-wrap gap-2">
              {(["zusage", "vielleicht", "absage"] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  disabled={antworten.isPending}
                  aria-pressed={meineAntwort === a}
                  onClick={() => ausfuehren(antworten.mutateAsync({ id: termin.id, antwort: a }))}
                  className={`${KNOPF} ${meineAntwort === a ? "bg-ca text-white" : "text-text-primary"}`}
                >
                  {t(`antwort.${a}`)}
                </button>
              ))}
            </div>
          </div>
        )}

        {termin && termin.einladungen.length > 0 && (
          <div className="mt-4">
            <p className="mb-1 text-xs font-bold text-text-tertiary">{t("eingeladen")}</p>
            <ul className="space-y-0.5 text-xs text-text-secondary">
              {termin.einladungen.map((e) => (
                <li key={e.user}>
                  {e.name} — {t(`antwort.${e.antwort}`)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {fehler && <p className="mt-3 text-xs text-status-dangerText">{fehler}</p>}

        {schreiben && termin && (
          <div className="mt-5 flex flex-wrap gap-2 border-t border-bg-tertiary pt-3">
            {termin.status === "vorgeschlagen" && (
              <>
                <button
                  type="button"
                  className={`${KNOPF} bg-ca text-white`}
                  onClick={() =>
                    ausfuehren(
                      aktion.mutateAsync({ id: termin.id, aktion: "freigeben" }),
                      onSchliessen,
                    )
                  }
                >
                  {t("freigeben")}
                </button>
                <button
                  type="button"
                  className={KNOPF}
                  onClick={() =>
                    ausfuehren(
                      aktion.mutateAsync({ id: termin.id, aktion: "ablehnen" }),
                      onSchliessen,
                    )
                  }
                >
                  {t("ablehnen")}
                </button>
              </>
            )}
            {kannAnkuendigen && (
              <button
                type="button"
                className={KNOPF}
                onClick={() =>
                  ausfuehren(aktion.mutateAsync({ id: termin.id, aktion: "ankuendigen" }))
                }
              >
                {t("ankuendigen")}
              </button>
            )}
            {termin.publikation && (
              <span className="self-center text-xs text-text-tertiary">{t("angekuendigt")}</span>
            )}
            <button type="button" className={KNOPF} onClick={() => onBearbeiten(termin)}>
              {t("bearbeiten")}
            </button>
            <button
              type="button"
              className={`${KNOPF} text-status-dangerText`}
              onClick={() => setLoeschenFrage(true)}
            >
              {t("loeschen")}
            </button>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={loeschenFrage}
        title={t("loeschen_titel")}
        message={t("loeschen_frage")}
        confirmLabel={t("loeschen")}
        danger
        onCancel={() => setLoeschenFrage(false)}
        onConfirm={() => {
          setLoeschenFrage(false);
          if (termin) ausfuehren(loeschen.mutateAsync(termin.id), onSchliessen);
        }}
      />
    </div>
  );
}
