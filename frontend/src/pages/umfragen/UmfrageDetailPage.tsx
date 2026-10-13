/**
 * Umfrage ausfüllen und Ergebnisse ansehen (Release 11). Erreichbar über die Liste im Tab
 * „Umfragen“, über die Ankündigung in den Neuigkeiten oder einen geteilten Link ; ohne Anmeldung
 * leitet RequireAuth zum Login und danach hierher zurück („Nur mit Konto“).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import ShareButton from "../../components/ui/ShareButton";
import UmfrageErgebnisse from "../../components/umfragen/UmfrageErgebnisse";
import { useUmfrage, useUmfrageTeilnehmen } from "../../hooks/useUmfragen";
import type { AntwortEingabe, Umfrage } from "../../types/umfragen";
import { extractApiErrorMessage } from "../../utils/apiError";
import { formatiereFrist } from "../../utils/umfragen";

type Eingabe = Record<string, { optionen: string[]; text: string }>;

function Fragebogen({ umfrage }: { umfrage: Umfrage }) {
  const { t } = useTranslation("umfragen");
  const teilnehmen = useUmfrageTeilnehmen();
  const [eingabe, setEingabe] = useState<Eingabe>({});
  const [fehler, setFehler] = useState("");

  const wert = (frageId: string) => eingabe[frageId] ?? { optionen: [], text: "" };
  const setze = (frageId: string, teil: Partial<{ optionen: string[]; text: string }>) =>
    setEingabe((alt) => ({ ...alt, [frageId]: { ...wert(frageId), ...teil } }));

  function umschalten(frageId: string, optionId: string, mehrfach: boolean) {
    const aktuell = wert(frageId).optionen;
    if (!mehrfach) return setze(frageId, { optionen: [optionId] });
    setze(frageId, {
      optionen: aktuell.includes(optionId)
        ? aktuell.filter((id) => id !== optionId)
        : [...aktuell, optionId],
    });
  }

  function absenden(e: React.FormEvent) {
    e.preventDefault();
    setFehler("");
    const fehlend = umfrage.fragen.find((frage) => {
      const w = wert(frage.id as string);
      const leer = frage.typ === "freitext" ? !w.text.trim() : w.optionen.length === 0;
      return frage.pflicht && leer;
    });
    if (fehlend) {
      setFehler(t("fragebogen.pflicht", { frage: fehlend.text }));
      return;
    }
    const antworten: AntwortEingabe[] = umfrage.fragen.map((frage) => {
      const w = wert(frage.id as string);
      return frage.typ === "freitext"
        ? { frage: frage.id as string, text: w.text }
        : { frage: frage.id as string, optionen: w.optionen };
    });
    teilnehmen.mutate(
      { id: umfrage.id, antworten },
      { onError: (err) => setFehler(extractApiErrorMessage(err, t("fragebogen.fehler"))) },
    );
  }

  return (
    <form onSubmit={absenden} className="space-y-3" data-testid="umfrage-fragebogen">
      {umfrage.fragen.map((frage) => {
        const id = frage.id as string;
        return (
          <fieldset key={id} className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
            <legend className="px-1 text-sm font-semibold text-text-primary">
              {frage.text}
              {frage.pflicht && <span className="text-status-dangerText"> *</span>}
            </legend>
            <p className="mb-2 text-[11px] text-text-tertiary">{t(`typ_hinweis.${frage.typ}`)}</p>
            {frage.typ === "freitext" ? (
              <textarea
                value={wert(id).text}
                onChange={(e) => setze(id, { text: e.target.value })}
                maxLength={2000}
                rows={3}
                aria-label={frage.text}
                className="w-full rounded-cid border border-text-tertiary/30 p-2 text-sm"
              />
            ) : (
              <div className="space-y-1">
                {frage.optionen.map((option) => (
                  <label
                    key={option.id}
                    className="flex cursor-pointer items-center gap-2 text-sm text-text-primary"
                  >
                    <input
                      type={frage.typ === "mehrfach" ? "checkbox" : "radio"}
                      name={id}
                      checked={wert(id).optionen.includes(option.id as string)}
                      onChange={() => umschalten(id, option.id as string, frage.typ === "mehrfach")}
                    />
                    {option.text}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        );
      })}
      {fehler && <p className="text-xs text-status-dangerText">{fehler}</p>}
      <button
        type="submit"
        disabled={teilnehmen.isPending}
        className="rounded-cid bg-ca px-4 py-2 text-sm font-medium text-white hover:bg-cad disabled:opacity-50"
      >
        {t("fragebogen.senden")}
      </button>
    </form>
  );
}

export default function UmfrageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation("umfragen");
  const umfrage = useUmfrage(id);

  if (umfrage.isLoading) return <p className="text-sm text-text-tertiary">{t("laden")}</p>;
  if (umfrage.isError || !umfrage.data) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-status-dangerText">{t("nicht_verfuegbar")}</p>
        <Link to="/quiz?tab=umfragen" className="text-sm text-ca underline">
          {t("zurueck")}
        </Link>
      </div>
    );
  }
  const u = umfrage.data;
  const ausfuellen = u.veroeffentlicht && !u.abgelaufen && !u.teilgenommen;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link to="/quiz?tab=umfragen" className="text-xs text-ca hover:underline">
        ← {t("zurueck")}
      </Link>
      {u.bild && (
        <img src={u.bild} alt="" className="max-h-56 w-full rounded-cid-lg object-cover" />
      )}
      <div className="flex items-start justify-between gap-2">
        <h1 className="text-xl font-bold text-text-primary">{u.titel}</h1>
        {u.veroeffentlicht && <ShareButton path={`/umfragen/${u.id}`} titre={u.titel} />}
      </div>
      {u.beschreibung && (
        <p className="whitespace-pre-line text-sm text-text-secondary">{u.beschreibung}</p>
      )}
      <p className="text-xs text-text-tertiary">
        {t(u.abgelaufen ? "beendet_am" : "bis", { datum: formatiereFrist(u.frist) })} ·{" "}
        {t(u.anonym ? "anonym_hinweis" : "namentlich_hinweis")} · {t(`zielgruppe.${u.zielgruppe}`)}
      </p>

      {ausfuellen && <Fragebogen umfrage={u} />}
      {u.teilgenommen && (
        <p className="rounded-cid bg-status-successBg p-3 text-sm text-status-successText">
          ✓ {t("danke")}
        </p>
      )}
      {!u.teilgenommen && u.abgelaufen && (
        <p className="rounded-cid bg-bg-secondary p-3 text-sm text-text-secondary">
          {t("frist_abgelaufen")}
        </p>
      )}

      {u.kann_ergebnisse_sehen ? (
        <UmfrageErgebnisse umfrageId={u.id} />
      ) : (
        u.teilgenommen && (
          <p className="text-xs text-text-tertiary">
            {t(
              u.ergebnis_modus === "admin" ? "ergebnisse.nur_verwaltung" : "ergebnisse.nach_frist",
            )}
          </p>
        )
      )}
    </div>
  );
}
