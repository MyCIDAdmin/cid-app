/**
 * Aktivität — Monatsberichte (Release 24) : Kennzahlen je abgeschlossenem Monat (nur Summen).
 * Der Bericht wird am 1. jedes Monats automatisch erzeugt und per Glocke/E-Mail an die
 * App-Admins gesendet ; hier lässt er sich nachlesen, neu berechnen und an sich selbst senden.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useBericht,
  useBerichte,
  useBerichtErzeugen,
  useBerichtSenden,
} from "../../hooks/useAktivitaet";
import type { BerichtDaten } from "../../types/aktivitaet";
import { zeitpunkt } from "../../utils/aktivitaet";

function Zeile({ label, wert }: { label: string; wert: number }) {
  return (
    <li className="flex items-center justify-between gap-2 py-1">
      <span className="text-text-secondary">{label}</span>
      <span className="font-medium tabular-nums text-text-primary">{wert}</span>
    </li>
  );
}

function Abschnitt({ titel, zeilen }: { titel: string; zeilen: [string, number][] }) {
  return (
    <section className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
      <h3 className="mb-1 text-xs font-medium text-text-primary">{titel}</h3>
      <ul className="divide-y divide-text-tertiary/10 text-xs">
        {zeilen.map(([label, wert]) => (
          <Zeile key={label} label={label} wert={wert} />
        ))}
      </ul>
    </section>
  );
}

function BerichtInhalt({ daten }: { daten: BerichtDaten }) {
  const { t } = useTranslation("aktivitaet");
  const k = (gruppe: string, schluessel: string) => t(`berichte.felder.${gruppe}.${schluessel}`);
  const eintraege = (gruppe: "sicherheit" | "betrieb" | "auffaelligkeiten" | "konten") =>
    Object.entries(daten[gruppe]).map(([schluessel, wert]): [string, number] => [
      k(gruppe, schluessel),
      wert,
    ]);
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Abschnitt titel={t("berichte.abschnitt.sicherheit")} zeilen={eintraege("sicherheit")} />
      <Abschnitt
        titel={t("berichte.abschnitt.aenderungen")}
        zeilen={Object.entries(daten.aenderungen).map(([s, w]): [string, number] => [
          k("aenderungen", s),
          w,
        ])}
      />
      <Abschnitt titel={t("berichte.abschnitt.betrieb")} zeilen={eintraege("betrieb")} />
      <Abschnitt
        titel={t("berichte.abschnitt.auffaelligkeiten")}
        zeilen={eintraege("auffaelligkeiten")}
      />
      <Abschnitt
        titel={t("berichte.abschnitt.nutzung")}
        zeilen={[
          [t("berichte.felder.nutzung.aktive"), daten.nutzung.aktive],
          ...daten.nutzung.module.map((m): [string, number] => [t(`module.${m.modul}`), m.nutzer]),
        ]}
      />
      <Abschnitt titel={t("berichte.abschnitt.konten")} zeilen={eintraege("konten")} />
    </div>
  );
}

export default function BerichtePanel() {
  const { t, i18n } = useTranslation("aktivitaet");
  const liste = useBerichte();
  const [auswahl, setAuswahl] = useState<{ jahr: number; monat: number } | null>(null);
  const bericht = useBericht(auswahl?.jahr ?? null, auswahl?.monat ?? null);
  const erzeugen = useBerichtErzeugen();
  const senden = useBerichtSenden();
  const [gesendet, setGesendet] = useState(false);

  if (liste.isLoading) return <p className="text-sm text-text-tertiary">{t("chargement")}</p>;
  if (liste.isError || !liste.data) {
    return <p className="text-sm text-status-dangerText">{t("erreur_chargement")}</p>;
  }
  const letzter = liste.data.letzter_abgeschlossener_monat;
  const vorhanden = liste.data.ergebnisse.some(
    (b) => b.jahr === letzter.jahr && b.monat === letzter.monat,
  );
  const monatsname = (jahr: number, monat: number) => `${String(monat).padStart(2, "0")}/${jahr}`;

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-tertiary">{t("berichte.hinweis")}</p>
      <div className="flex flex-wrap items-center gap-2">
        {liste.data.ergebnisse.map((b) => (
          <button
            key={`${b.jahr}-${b.monat}`}
            type="button"
            aria-pressed={auswahl?.jahr === b.jahr && auswahl?.monat === b.monat}
            onClick={() => {
              setAuswahl({ jahr: b.jahr, monat: b.monat });
              setGesendet(false);
            }}
            className={`rounded-cid-lg px-3 py-1 text-xs font-medium ${
              auswahl?.jahr === b.jahr && auswahl?.monat === b.monat
                ? "bg-ca text-white"
                : "bg-bg-tertiary text-text-secondary"
            }`}
          >
            {monatsname(b.jahr, b.monat)}
          </button>
        ))}
        {!vorhanden && (
          <button
            type="button"
            disabled={erzeugen.isPending}
            onClick={() =>
              erzeugen.mutate(letzter, { onSuccess: () => setAuswahl({ ...letzter }) })
            }
            className="rounded-cid-lg border border-ca px-3 py-1 text-xs font-medium text-ca disabled:opacity-50"
          >
            {t("berichte.erzeugen", { monat: monatsname(letzter.jahr, letzter.monat) })}
          </button>
        )}
      </div>

      {liste.data.ergebnisse.length === 0 && !vorhanden && (
        <p className="rounded-cid-lg bg-bg-primary p-4 text-sm text-text-tertiary shadow-sm">
          {t("berichte.leer")}
        </p>
      )}

      {auswahl && bericht.isLoading && (
        <p className="text-sm text-text-tertiary">{t("chargement")}</p>
      )}
      {auswahl && bericht.data && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-text-tertiary">
              {t("berichte.stand", {
                erstellt: zeitpunkt(bericht.data.erstellt_am, i18n.language),
                versendet: bericht.data.versendet_am
                  ? zeitpunkt(bericht.data.versendet_am, i18n.language)
                  : t("berichte.nicht_versendet"),
              })}
            </p>
            <div className="flex gap-3 text-xs font-medium">
              <button
                type="button"
                className="text-ca disabled:opacity-50"
                disabled={erzeugen.isPending}
                onClick={() => erzeugen.mutate(auswahl)}
              >
                {t("berichte.neu_berechnen")}
              </button>
              <button
                type="button"
                className="text-ca disabled:opacity-50"
                disabled={senden.isPending}
                onClick={() => senden.mutate(auswahl, { onSuccess: () => setGesendet(true) })}
              >
                {t("berichte.an_mich")}
              </button>
            </div>
          </div>
          {gesendet && (
            <p role="status" className="text-xs text-status-successText">
              {t("berichte.gesendet")}
            </p>
          )}
          <BerichtInhalt daten={bericht.data.daten} />
        </div>
      )}
    </div>
  );
}
