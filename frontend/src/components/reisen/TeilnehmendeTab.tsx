/** Reiter „Teilnehmende“ : Anfragen, Ampel, Übersichten (gruppiert, anonym) und die Liste nach Freigabe. */
import { useTranslation } from "react-i18next";

import {
  useAnfrageEntscheiden,
  useRolleSetzen,
  useTeilnehmer,
  useTeilnehmerEntfernen,
  useUebernehmen,
  useUebersicht,
} from "../../hooks/useReisen";
import { datumKurz, zeitKurz } from "../../utils/reisen";
import type {
  Etappe,
  EtappeGrob,
  ReiseDetail,
  Teilnehmer,
  UebersichtZeile,
} from "../../types/reisen";
import ExportKnoepfe from "./ExportKnoepfe";
import TeilgruppenAbschnitt from "./TeilgruppenAbschnitt";
import { KARTE, KNOPF, KNOPF_LEISE } from "./ui";

function istVoll(e: Etappe | EtappeGrob): e is Etappe {
  return "von_ort" in e;
}

function Gruppe({
  titel,
  zeilen,
  leer,
}: {
  titel: string;
  zeilen: UebersichtZeile[];
  leer: string;
}) {
  const { t, i18n } = useTranslation("reisen");
  return (
    <div className={KARTE}>
      <h3 className="mb-1 text-xs font-semibold">{titel}</h3>
      {zeilen.length === 0 ? (
        <p className="text-xs text-text-tertiary">{leer}</p>
      ) : (
        <ul className="space-y-0.5 text-sm">
          {zeilen.map((z) => (
            <li key={`${z.ort}-${z.tag}`}>
              <span className="font-medium">{z.ort}</span> ·{" "}
              {z.tag ? datumKurz(z.tag, i18n.language) : t("uebersicht.ohne_datum")} ·{" "}
              {t("uebersicht.personen", { count: z.anzahl })}
              {z.namen.length > 0 && (
                <span className="text-xs text-text-tertiary"> ({z.namen.join(", ")})</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Zeile({ tn, reise }: { tn: Teilnehmer; reise: ReiseDetail }) {
  const { t, i18n } = useTranslation("reisen");
  const rolle = useRolleSetzen(reise.id);
  const entfernen = useTeilnehmerEntfernen(reise.id);
  const etappen = tn.etappen ?? [];
  return (
    <li className={KARTE} data-testid={`teilnehmer-${tn.user}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {tn.name}
          {tn.begleitpersonen > 0 && (
            <span className="text-xs text-text-tertiary"> +{tn.begleitpersonen}</span>
          )}
          <span className="ml-2 rounded-full bg-bg-tertiary px-2 py-0.5 text-[10px]">
            {t(`status.${tn.status}`)}
          </span>
          {tn.rolle !== "teilnehmer" && (
            <span className="ml-1 rounded-full bg-ca/10 px-2 py-0.5 text-[10px] text-ca">
              {t(`rolle.${tn.rolle}`)}
            </span>
          )}
        </p>
        {reise.kann_verwalten && tn.rolle !== "organisator" && (
          <div className="flex gap-1">
            {reise.ist_organisator && tn.status === "dabei" && (
              <button
                type="button"
                className={KNOPF_LEISE}
                onClick={() =>
                  rolle.mutate({
                    tid: tn.id,
                    rolle: tn.rolle === "vertreter" ? "teilnehmer" : "vertreter",
                  })
                }
              >
                {tn.rolle === "vertreter" ? t("rolle.entziehen") : t("rolle.vertreter_machen")}
              </button>
            )}
            <button
              type="button"
              className="text-xs text-red-600"
              onClick={() => entfernen.mutate(tn.id)}
            >
              {t("teilnehmer.entfernen")}
            </button>
          </div>
        )}
      </div>
      {etappen.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs text-text-secondary">
          {etappen.map((e) =>
            istVoll(e) ? (
              <li key={e.id}>
                {t(`richtung.${e.richtung}`)}: {e.von_ort} → {e.nach_ort} (
                {zeitKurz(e.abfahrt, i18n.language)}
                {e.ankunft ? ` – ${zeitKurz(e.ankunft, i18n.language)}` : ""}) ·{" "}
                {t(`etappe_status.${e.status}`)}
              </li>
            ) : (
              <li key={e.id}>
                {t(`richtung.${e.richtung}`)}: {e.nach_ort}
                {e.tag ? `, ${datumKurz(e.tag, i18n.language)}` : ""} ·{" "}
                {e.gebucht ? t("teilnehmer.gebucht") : t("teilnehmer.nicht_gebucht")}
              </li>
            ),
          )}
        </ul>
      )}
      {tn.unterkunft && (
        <p className="mt-0.5 text-xs text-text-secondary">
          {t("meine.unterkunft")}:{" "}
          {tn.unterkunft.name ??
            (tn.unterkunft.gebucht ? t("teilnehmer.gebucht") : t("teilnehmer.nicht_gebucht"))}
        </p>
      )}
      {tn.stadionkarte !== undefined && (
        <p className="mt-0.5 text-[11px] text-text-tertiary">
          {t("haken.stadionkarte")}: {tn.stadionkarte ? "✓" : "–"} · {t("haken.dokument")}:{" "}
          {tn.dokument_gueltig ? "✓" : "–"} · {t("haken.regeln")}:{" "}
          {tn.regeln_bestaetigt ? "✓" : "–"}
          {tn.notiz ? ` · ${tn.notiz}` : ""}
        </p>
      )}
    </li>
  );
}

export default function TeilnehmendeTab({ reise }: { reise: ReiseDetail }) {
  const { t } = useTranslation("reisen");
  const liste = useTeilnehmer(reise.id, reise.voll);
  const uebersicht = useUebersicht(reise.id, reise.voll);
  const entscheiden = useAnfrageEntscheiden(reise.id);
  const uebernehmen = useUebernehmen(reise.id);
  const eintraege = liste.data ?? [];
  const anfragen = eintraege.filter((x) => x.status === "angefragt");
  const uebrige = eintraege.filter((x) => x.status !== "angefragt");
  const u = uebersicht.data;

  if (!reise.voll) {
    return (
      <p className="text-sm text-text-secondary" data-testid="nur-zaehler">
        {t("teilnehmer.nur_zaehler", { dabei: reise.dabei, interessiert: reise.interessiert })}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {anfragen.length > 0 && reise.kann_verwalten && (
        <section>
          <h2 className="mb-1 text-sm font-semibold">{t("teilnehmer.anfragen")}</h2>
          <ul className="space-y-1.5">
            {anfragen.map((a) => (
              <li
                key={a.id}
                className={`${KARTE} flex flex-wrap items-center justify-between gap-2`}
              >
                <span className="text-sm">
                  {a.name}
                  {a.nachricht && (
                    <span className="block text-xs text-text-tertiary">{a.nachricht}</span>
                  )}
                </span>
                <span className="flex gap-1">
                  <button
                    type="button"
                    className={KNOPF}
                    onClick={() => entscheiden.mutate({ tid: a.id, zusage: true })}
                  >
                    {t("teilnehmer.zusagen")}
                  </button>
                  <button
                    type="button"
                    className={KNOPF_LEISE}
                    onClick={() => entscheiden.mutate({ tid: a.id, zusage: false })}
                  >
                    {t("teilnehmer.ablehnen")}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {u && (
        <section className="space-y-2" aria-label={t("uebersicht.titel")}>
          <h2 className="text-sm font-semibold">{t("uebersicht.titel")}</h2>
          <p className="text-xs text-text-secondary" data-testid="ampel">
            {t("uebersicht.ampel", {
              hin: u.ampel.hin_gebucht,
              rueck: u.ampel.rueck_gebucht,
              unterkunft: u.ampel.unterkunft_gebucht,
              gesamt: u.ampel.teilnehmer,
            })}
          </p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <Gruppe
              titel={t("uebersicht.ankuenfte")}
              zeilen={u.ankuenfte}
              leer={t("uebersicht.leer")}
            />
            <Gruppe
              titel={t("uebersicht.abreisen")}
              zeilen={u.abreisen}
              leer={t("uebersicht.leer")}
            />
            <Gruppe
              titel={t("uebersicht.belegung")}
              zeilen={u.belegung.map((b) => ({
                ort: b.unterkunft,
                tag: null,
                anzahl: b.anzahl,
                namen: b.namen,
              }))}
              leer={t("uebersicht.leer")}
            />
          </div>
          <p className="text-[11px] text-text-tertiary">{t("uebersicht.hinweis")}</p>
        </section>
      )}

      <TeilgruppenAbschnitt reise={reise} teilnehmer={eintraege} />
      {reise.kann_verwalten && <ExportKnoepfe reise={reise} />}

      <section>
        <h2 className="mb-1 text-sm font-semibold">{t("teilnehmer.liste")}</h2>
        <ul className="space-y-1.5">
          {uebrige.map((x) => (
            <Zeile key={x.id} tn={x} reise={reise} />
          ))}
        </ul>
      </section>

      {reise.meine_rolle === "vertreter" && (
        <button type="button" className={KNOPF_LEISE} onClick={() => uebernehmen.mutate()}>
          {t("teilnehmer.uebernehmen")}
        </button>
      )}
    </div>
  );
}
