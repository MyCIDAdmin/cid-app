/**
 * Aktivität — Datenpflege (Release 25) : alte Protokoll- und Hilfsdaten automatisch (täglich) oder
 * auf Knopfdruck löschen. Zeigt je Datenart, wie viel betroffen wäre, bevor etwas gelöscht wird.
 * Geschäftsdaten (Mitglieder, Beiträge, Inhalte …) sind nicht enthalten.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { usePflege, usePflegeAusfuehren, usePflegeSpeichern } from "../../hooks/useAktivitaet";
import { PFLEGE_GRUPPEN, type PflegeArt } from "../../types/aktivitaet";
import { textIn, zeitpunkt } from "../../utils/aktivitaet";

function gueltig(art: PflegeArt, wert: string): boolean {
  const zahl = Number(wert);
  return Number.isInteger(zahl) && zahl >= art.minimum && zahl <= art.maximum;
}

export default function PflegePanel() {
  const { t, i18n } = useTranslation("aktivitaet");
  const { data, isLoading, isError } = usePflege();
  const speichern = usePflegeSpeichern();
  const ausfuehren = usePflegeAusfuehren();
  const [entwurf, setEntwurf] = useState<Record<string, string>>({});
  const [auswahl, setAuswahl] = useState<string[]>([]);
  const [rueckfrage, setRueckfrage] = useState(false);
  const [geloescht, setGeloescht] = useState<number | null>(null);

  if (isLoading) return <p className="text-sm text-text-tertiary">{t("chargement")}</p>;
  if (isError || !data) {
    return <p className="text-sm text-status-dangerText">{t("erreur_chargement")}</p>;
  }

  const wert = (art: PflegeArt) => entwurf[art.key] ?? String(art.frist);
  const geaendert = data.arten.filter((a) => !a.fest && wert(a) !== String(a.frist));
  const ungueltig = geaendert.some((a) => !gueltig(a, wert(a)));
  const gewaehlt = data.arten.filter((a) => auswahl.includes(a.key));
  const summe = gewaehlt.reduce((s, a) => s + a.betroffen, 0);

  const umschalten = (key: string) => {
    setRueckfrage(false);
    setGeloescht(null);
    setAuswahl((alt) => (alt.includes(key) ? alt.filter((k) => k !== key) : [...alt, key]));
  };

  const fristenSpeichern = () =>
    speichern.mutate(
      { fristen: Object.fromEntries(geaendert.map((a) => [a.key, Number(wert(a))])) },
      { onSuccess: () => setEntwurf({}) },
    );

  const loeschen = () =>
    ausfuehren.mutate(auswahl, {
      onSuccess: (antwort) => {
        setGeloescht(antwort.summe);
        setRueckfrage(false);
        setAuswahl([]);
      },
    });

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-tertiary">{t("pflege.hinweis")}</p>

      <section className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
        <label className="flex items-start gap-2 text-sm text-text-primary">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={data.automatisch}
            disabled={speichern.isPending}
            onChange={(e) => speichern.mutate({ automatisch: e.target.checked })}
          />
          <span>
            {t("pflege.automatisch")}
            <span className="block text-xs text-text-tertiary">{t("pflege.automatisch_info")}</span>
          </span>
        </label>
        {!data.automatisch && (
          <p role="alert" className="mt-2 text-xs text-status-warningText">
            {t("pflege.automatisch_aus")}
          </p>
        )}
        <p className="mt-2 text-xs text-text-tertiary">
          {data.letzter_lauf
            ? t("pflege.letzter_lauf", {
                zeit: zeitpunkt(data.letzter_lauf.zeit, i18n.language),
                modus: t(`pflege.modus.${data.letzter_lauf.modus}`),
                anzahl: Object.values(data.letzter_lauf.ergebnis).reduce((s, n) => s + n, 0),
              })
            : t("pflege.noch_nie")}
        </p>
      </section>

      {PFLEGE_GRUPPEN.map((gruppe) => (
        <section key={gruppe} className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
          <h3 className="mb-1 text-xs font-medium text-text-primary">
            {t(`pflege.gruppe.${gruppe}`)}
          </h3>
          <ul className="divide-y divide-text-tertiary/10">
            {data.arten
              .filter((a) => a.gruppe === gruppe)
              .map((a) => (
                <li key={a.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <input
                    type="checkbox"
                    aria-label={textIn(i18n.language, a.label)}
                    checked={auswahl.includes(a.key)}
                    onChange={() => umschalten(a.key)}
                  />
                  <div className="min-w-0 flex-1 text-xs">
                    <div className="text-sm text-text-primary">
                      {textIn(i18n.language, a.label)}
                    </div>
                    <div className="text-text-tertiary">{textIn(i18n.language, a.info)}</div>
                    <div className="mt-0.5 tabular-nums text-text-secondary">
                      {t("pflege.bestand", { gesamt: a.gesamt })}
                      {a.aeltester &&
                        ` · ${t("pflege.aeltester")}: ${zeitpunkt(a.aeltester, i18n.language)}`}
                      {" · "}
                      <span
                        className={a.betroffen > 0 ? "font-medium text-status-warningText" : ""}
                      >
                        {t("pflege.betroffen", { anzahl: a.betroffen })}
                      </span>
                    </div>
                  </div>
                  {a.fest ? (
                    <span className="text-xs text-text-tertiary">{t("pflege.fest")}</span>
                  ) : (
                    <div className="flex items-center gap-1 text-xs text-text-secondary">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={a.minimum}
                        max={a.maximum}
                        aria-label={`${textIn(i18n.language, a.label)} – ${t("pflege.frist")}`}
                        aria-invalid={!gueltig(a, wert(a))}
                        value={wert(a)}
                        onChange={(e) => setEntwurf({ ...entwurf, [a.key]: e.target.value })}
                        className="w-20 rounded-cid-lg border border-text-tertiary/30 bg-bg-primary px-2 py-1 text-right tabular-nums"
                      />
                      <span>{t("pflege.tage")}</span>
                      <span className="text-text-tertiary">
                        ({t("pflege.minimum", { tage: a.minimum })})
                      </span>
                      {wert(a) !== String(a.standard) && (
                        <button
                          type="button"
                          className="text-ca"
                          onClick={() => setEntwurf({ ...entwurf, [a.key]: String(a.standard) })}
                        >
                          {t("pflege.standard", { tage: a.standard })}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
          </ul>
        </section>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={geaendert.length === 0 || ungueltig || speichern.isPending}
          onClick={fristenSpeichern}
          className="rounded-cid-lg bg-ca px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {t("pflege.speichern")}
        </button>
        {ungueltig && (
          <span role="alert" className="text-xs text-status-dangerText">
            {t("pflege.ungueltig")}
          </span>
        )}
        <button
          type="button"
          className="text-xs font-medium text-ca"
          onClick={() => setAuswahl(data.arten.filter((a) => a.betroffen > 0).map((a) => a.key))}
        >
          {t("pflege.mit_treffern_waehlen")}
        </button>
      </div>

      <section className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
        <h3 className="mb-1 text-xs font-medium text-text-primary">{t("pflege.manuell")}</h3>
        <p className="text-xs text-text-tertiary">
          {geaendert.length > 0 ? t("pflege.erst_speichern") : t("pflege.manuell_info")}
        </p>
        {!rueckfrage ? (
          <button
            type="button"
            disabled={auswahl.length === 0 || geaendert.length > 0}
            onClick={() => setRueckfrage(true)}
            className="mt-2 rounded-cid-lg border border-status-dangerText px-3 py-1.5 text-xs font-medium text-status-dangerText disabled:opacity-50"
          >
            {t("pflege.jetzt", { count: auswahl.length })}
          </button>
        ) : (
          <div
            role="alertdialog"
            aria-label={t("pflege.rueckfrage_titel")}
            className="mt-2 space-y-2"
          >
            <p className="text-xs text-status-dangerText">
              {t("pflege.rueckfrage", { anzahl: summe, arten: auswahl.length })}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={ausfuehren.isPending}
                onClick={loeschen}
                className="rounded-cid-lg bg-status-dangerText px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                {t("pflege.endgueltig")}
              </button>
              <button
                type="button"
                onClick={() => setRueckfrage(false)}
                className="rounded-cid-lg bg-bg-tertiary px-3 py-1.5 text-xs font-medium text-text-secondary"
              >
                {t("pflege.abbrechen")}
              </button>
            </div>
          </div>
        )}
        {geloescht !== null && (
          <p role="status" className="mt-2 text-xs text-status-successText">
            {t("pflege.erledigt", { anzahl: geloescht })}
          </p>
        )}
      </section>
    </div>
  );
}
