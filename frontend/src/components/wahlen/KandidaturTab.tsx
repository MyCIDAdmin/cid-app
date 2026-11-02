/**
 * Meine Kandidatur : ausfüllen, Nachweise hochladen, Unterstützungen sammeln, einreichen.
 * Pflichtangaben und Wählbarkeit meldet der Server (`fehlend`, `waehlbarkeit`) – hier wird nur
 * angezeigt, nie selbst entschieden.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useKandidaturAktionen,
  useKandidaturAnlegen,
  useKandidaturen,
} from "../../hooks/useWahlen";
import type {
  Amt,
  Kandidatur,
  KandidaturPayload,
  KandidatPerson,
  Sprache,
  Wahl,
} from "../../types/wahlen";
import { extractApiErrorMessage } from "../../utils/apiError";
import { datum, istAntrag, istListe, LISTEN_AEMTER } from "../../utils/wahlen";
import EinspruchFormular from "./EinspruchFormular";
import MitgliedAuswahl from "./MitgliedAuswahl";

const FELD = "w-full rounded-cid border border-text-tertiary/30 p-2 text-sm";

function Datei({
  label,
  vorhanden,
  onDatei,
  accept,
  gesperrt,
}: {
  label: string;
  vorhanden: boolean;
  onDatei: (datei: File) => void;
  accept: string;
  gesperrt: boolean;
}) {
  const { t } = useTranslation("wahlen");
  return (
    <label className="flex flex-wrap items-center gap-2 text-xs">
      <span className="min-w-40 text-text-secondary">{label}</span>
      <span className={vorhanden ? "text-status-successText" : "text-text-tertiary"}>
        {vorhanden ? t("kandidatur.hochgeladen") : t("kandidatur.fehlt")}
      </span>
      {!gesperrt && (
        <input
          type="file"
          accept={accept}
          aria-label={label}
          onChange={(e) => {
            const datei = e.target.files?.[0];
            if (datei) onDatei(datei);
            e.target.value = "";
          }}
          className="text-xs"
        />
      )}
    </label>
  );
}

function WaehlbarkeitChips({ person }: { person: KandidatPerson }) {
  const { t } = useTranslation("wahlen");
  const w = person.waehlbarkeit;
  if (!w) return null;
  const chip = (ok: boolean, text: string) => (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] ${
        ok
          ? "bg-status-successBg text-status-successText"
          : "bg-status-dangerBg text-status-dangerText"
      }`}
    >
      {ok ? "✓" : "✗"} {text}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-1" data-testid="waehlbarkeit">
      {chip(w.aktiv_beitrag, t("waehlbarkeit.aktiv"))}
      {chip(w.dauer_ok, t("waehlbarkeit.dauer", { jahre: w.jahre, noetig: w.jahre_noetig }))}
      {chip(w.kein_ausschuss, t("waehlbarkeit.ausschuss"))}
    </div>
  );
}

function Formular({ wahl, kandidatur }: { wahl: Wahl; kandidatur: Kandidatur }) {
  const { t } = useTranslation("wahlen");
  const aktionen = useKandidaturAktionen(kandidatur.id);
  const [fehler, setFehler] = useState("");
  const [werte, setWerte] = useState({
    name: kandidatur.name,
    leitsatz: kandidatur.leitsatz,
    vorstellung: kandidatur.vorstellung,
    programm: [0, 1, 2].map((i) => kandidatur.programm[i] ?? ""),
    sprache: kandidatur.sprache,
    rechte_foto: Boolean(kandidatur.rechte_foto),
    bestaetigt_wahlordnung: Boolean(kandidatur.bestaetigt_wahlordnung),
    bestaetigt_fairness: Boolean(kandidatur.bestaetigt_fairness),
    bestaetigt_datenschutz: Boolean(kandidatur.bestaetigt_datenschutz),
  });
  const [personen, setPersonen] = useState(
    kandidatur.personen.map((p) => ({ membre: p.membre, name: p.name, amt: p.amt })),
  );

  // Nach einem Hochladen o. Ä. liefert der Server das Dossier neu: Personenliste angleichen.
  useEffect(() => {
    setPersonen(kandidatur.personen.map((p) => ({ membre: p.membre, name: p.name, amt: p.amt })));
  }, [kandidatur.personen]);

  const gesperrt = !["entwurf", "rueckfrage"].includes(kandidatur.status);
  const liste = istListe(wahl);
  const antrag = istAntrag(wahl);
  const fehlend = kandidatur.fehlend ?? [];
  const merken = (e: unknown, standard: string) => setFehler(extractApiErrorMessage(e, standard));

  function speichern() {
    setFehler("");
    const payload: KandidaturPayload = { ...werte };
    if (liste) payload.personen = personen.map(({ membre, amt }) => ({ membre, amt }));
    aktionen.aendern.mutate(payload, { onError: (e) => merken(e, t("kandidatur.fehler")) });
  }

  function aktion(a: "unterstuetzen" | "einreichen" | "zurueckziehen") {
    setFehler("");
    aktionen.aktion.mutate(a, { onError: (e) => merken(e, t("kandidatur.fehler")) });
  }

  const hochladen = (art: string, datei: File, person?: string) =>
    aktionen.nachweis.mutate(
      { art, datei, person },
      { onError: (e) => merken(e, t("kandidatur.upload_fehler")) },
    );
  const hat = (art: string, person?: string) =>
    (kandidatur.nachweise ?? []).some((n) => n.art === art && (n.person ?? undefined) === person);

  const link = `${window.location.origin}/wahlen/${wahl.id}?unterstuetzen=${kandidatur.id}`;
  const praesident = personen.find((p) => p.amt === "pres");

  return (
    <div className="space-y-4" data-testid="kandidatur-formular">
      {kandidatur.status === "rueckfrage" && (
        <p className="rounded-cid bg-status-warningBg p-3 text-sm text-status-warningText">
          {t("kandidatur.rueckfrage", { frist: datum(kandidatur.nachbesserung_bis, true) })}
          <br />
          {kandidatur.begruendung}
        </p>
      )}
      {kandidatur.status === "abgelehnt" && (
        <p className="rounded-cid bg-status-dangerBg p-3 text-sm text-status-dangerText">
          {t("kandidatur.abgelehnt", { artikel: kandidatur.artikel })}
          <br />
          {kandidatur.begruendung}
        </p>
      )}
      {kandidatur.status === "abgelehnt" &&
        kandidatur.einspruch_bis &&
        new Date(kandidatur.einspruch_bis).getTime() > Date.now() && (
          <EinspruchFormular
            wahl={wahl.id}
            art="ablehnung"
            kandidatur={kandidatur.id}
            bis={kandidatur.einspruch_bis}
          />
        )}
      {gesperrt && kandidatur.status === "eingereicht" && (
        <p className="rounded-cid bg-bg-secondary p-3 text-sm text-text-secondary">
          {t("kandidatur.eingereicht", { datum: datum(kandidatur.eingereicht_am, true) })}
        </p>
      )}
      {kandidatur.status === "zugelassen" && (
        <p className="rounded-cid bg-status-successBg p-3 text-sm text-status-successText">
          {t("kandidatur.zugelassen")}
        </p>
      )}

      {(liste || antrag) && (
        <label className="block text-sm">
          <span className="text-text-secondary">
            {liste ? t("kandidatur.listenname") : t("kandidatur.antragstitel")}
          </span>
          <input
            value={werte.name}
            maxLength={200}
            disabled={gesperrt}
            onChange={(e) => setWerte({ ...werte, name: e.target.value })}
            className={FELD}
          />
        </label>
      )}

      {!antrag && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-text-primary">
            {liste ? t("kandidatur.personen") : t("kandidatur.person")}
          </h3>
          {personen.map((lokal) => {
            const person = kandidatur.personen.find((p) => p.membre === lokal.membre);
            if (!person) {
              return (
                <div
                  key={lokal.membre}
                  className="flex flex-wrap items-center gap-2 rounded-cid border border-dashed border-text-tertiary/30 p-3 text-sm"
                  data-testid="kandidat-person-neu"
                >
                  <span className="font-medium">{lokal.name}</span>
                  <span className="text-xs text-text-tertiary">
                    {t("kandidatur.noch_nicht_gespeichert")}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPersonen(personen.filter((p) => p.membre !== lokal.membre))}
                    className="text-xs text-status-dangerText underline"
                  >
                    {t("kandidatur.entfernen")}
                  </button>
                </div>
              );
            }
            return (
              <div
                key={person.id}
                className="space-y-2 rounded-cid border border-text-tertiary/20 p-3"
                data-testid="kandidat-person"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{person.name}</span>
                  {liste && lokal && (
                    <select
                      value={lokal.amt}
                      disabled={gesperrt || person.amt === "pres"}
                      aria-label={t("kandidatur.amt")}
                      onChange={(e) =>
                        setPersonen(
                          personen.map((p) =>
                            p.membre === person.membre ? { ...p, amt: e.target.value as Amt } : p,
                          ),
                        )
                      }
                      className="rounded-cid border border-text-tertiary/30 p-1 text-xs"
                    >
                      {LISTEN_AEMTER.map((amt) => (
                        <option key={amt} value={amt}>
                          {t(`amt.${amt}`)}
                        </option>
                      ))}
                    </select>
                  )}
                  {liste && person.amt !== "pres" && !gesperrt && (
                    <button
                      type="button"
                      onClick={() =>
                        setPersonen(personen.filter((p) => p.membre !== person.membre))
                      }
                      className="text-xs text-status-dangerText underline"
                    >
                      {t("kandidatur.entfernen")}
                    </button>
                  )}
                </div>
                <WaehlbarkeitChips person={person} />
                <Datei
                  label={t("kandidatur.foto")}
                  vorhanden={Boolean(person.foto)}
                  accept="image/jpeg,image/png,image/webp"
                  gesperrt={gesperrt}
                  onDatei={(foto) =>
                    aktionen.foto.mutate(
                      { person: person.id, foto },
                      { onError: (e) => merken(e, t("kandidatur.upload_fehler")) },
                    )
                  }
                />
                {liste && (
                  <Datei
                    label={t("nachweis.abschluss")}
                    vorhanden={hat("abschluss", person.id)}
                    accept="application/pdf,image/jpeg,image/png"
                    gesperrt={gesperrt}
                    onDatei={(d) => hochladen("abschluss", d, person.id)}
                  />
                )}
                <Datei
                  label={t("nachweis.ehrenerklaerung")}
                  vorhanden={hat("ehrenerklaerung", person.id)}
                  accept="application/pdf,image/jpeg,image/png"
                  gesperrt={gesperrt}
                  onDatei={(d) => hochladen("ehrenerklaerung", d, person.id)}
                />
                {liste && person.amt === "pres" && (
                  <Datei
                    label={t("nachweis.b2")}
                    vorhanden={hat("b2", person.id)}
                    accept="application/pdf,image/jpeg,image/png"
                    gesperrt={gesperrt}
                    onDatei={(d) => hochladen("b2", d, person.id)}
                  />
                )}
              </div>
            );
          })}
          {liste && !gesperrt && personen.length < wahl.listen_groesse && (
            <div className="space-y-1">
              <p className="text-xs text-text-secondary">
                {t("kandidatur.person_hinzu", { n: personen.length, max: wahl.listen_groesse })}
              </p>
              <MitgliedAuswahl
                ariaLabel={t("kandidatur.person_suchen")}
                ausgeschlossen={personen.map((p) => p.membre)}
                onWahl={(m) =>
                  setPersonen([
                    ...personen,
                    { membre: m.id, name: `${m.prenom} ${m.nom}`, amt: "more" },
                  ])
                }
              />
              <p className="text-[11px] text-text-tertiary">{t("kandidatur.erst_speichern")}</p>
            </div>
          )}
          {liste && (
            <Datei
              label={t("nachweis.verwandtschaft")}
              vorhanden={hat("verwandtschaft")}
              accept="application/pdf,image/jpeg,image/png"
              gesperrt={gesperrt}
              onDatei={(d) => hochladen("verwandtschaft", d)}
            />
          )}
          {liste && !praesident && (
            <p className="text-xs text-status-warningText">{t("kandidatur.praesident_fehlt")}</p>
          )}
        </section>
      )}

      {!antrag && (
        <label className="block text-sm">
          <span className="text-text-secondary">{t("kandidatur.leitsatz")}</span>
          <input
            value={werte.leitsatz}
            maxLength={80}
            disabled={gesperrt}
            onChange={(e) => setWerte({ ...werte, leitsatz: e.target.value })}
            className={FELD}
          />
        </label>
      )}
      <label className="block text-sm">
        <span className="text-text-secondary">
          {antrag ? t("kandidatur.wortlaut") : t("kandidatur.vorstellung")}
        </span>
        <textarea
          rows={4}
          maxLength={600}
          value={werte.vorstellung}
          disabled={gesperrt}
          onChange={(e) => setWerte({ ...werte, vorstellung: e.target.value })}
          className={FELD}
        />
        <span className="text-[11px] text-text-tertiary">{werte.vorstellung.length} / 600</span>
      </label>
      {!antrag && (
        <fieldset className="space-y-1">
          <legend className="text-sm text-text-secondary">{t("kandidatur.programm")}</legend>
          {werte.programm.map((zeile, i) => (
            <input
              key={i}
              value={zeile}
              maxLength={160}
              disabled={gesperrt}
              aria-label={t("kandidatur.programm_punkt", { n: i + 1 })}
              onChange={(e) =>
                setWerte({
                  ...werte,
                  programm: werte.programm.map((z, j) => (j === i ? e.target.value : z)),
                })
              }
              className={FELD}
            />
          ))}
        </fieldset>
      )}
      <label className="block text-sm">
        <span className="text-text-secondary">{t("kandidatur.sprache")}</span>
        <select
          value={werte.sprache}
          disabled={gesperrt}
          onChange={(e) => setWerte({ ...werte, sprache: e.target.value as Sprache })}
          className={FELD}
        >
          <option value="de">Deutsch</option>
          <option value="fr">Français</option>
          <option value="ar">العربية</option>
        </select>
      </label>

      <fieldset className="space-y-1 text-sm">
        {!antrag && (
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={werte.rechte_foto}
              disabled={gesperrt}
              onChange={(e) => setWerte({ ...werte, rechte_foto: e.target.checked })}
            />
            {t("kandidatur.rechte_foto")}
          </label>
        )}
        {(
          [
            ["bestaetigt_wahlordnung", "kandidatur.best_wahlordnung"],
            ["bestaetigt_fairness", "kandidatur.best_fairness"],
            ["bestaetigt_datenschutz", "kandidatur.best_datenschutz"],
          ] as const
        ).map(([feld, text]) => (
          <label key={feld} className="flex gap-2">
            <input
              type="checkbox"
              checked={werte[feld]}
              disabled={gesperrt}
              onChange={(e) => setWerte({ ...werte, [feld]: e.target.checked })}
            />
            {t(text)}
          </label>
        ))}
      </fieldset>

      <section className="rounded-cid bg-bg-secondary p-3 text-sm">
        <p className="font-medium">
          {t("kandidatur.unterstuetzung", {
            n: kandidatur.unterstuetzungen ?? 0,
            noetig: kandidatur.unterstuetzungen_noetig ?? wahl.unterstuetzungen_noetig,
          })}
        </p>
        {!gesperrt && (
          <>
            <p className="mt-1 text-xs text-text-secondary">{t("kandidatur.link_hinweis")}</p>
            <input
              readOnly
              value={link}
              aria-label={t("kandidatur.link")}
              onFocus={(e) => e.currentTarget.select()}
              className={`${FELD} mt-1`}
            />
          </>
        )}
      </section>

      {fehlend.length > 0 && !gesperrt && (
        <p className="text-sm text-status-warningText" data-testid="fehlend">
          {t("kandidatur.noch_offen", { n: fehlend.length })}{" "}
          {fehlend.map((f) => t(`fehlend.${f}`, { defaultValue: f })).join(", ")}
        </p>
      )}
      {fehler && (
        <p role="alert" className="text-sm text-status-dangerText">
          {fehler}
        </p>
      )}
      {!gesperrt && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={speichern}
            disabled={aktionen.aendern.isPending}
            className="rounded-cid border border-ca px-4 py-2 text-sm font-semibold text-ca disabled:opacity-50"
          >
            {t("kandidatur.speichern")}
          </button>
          <button
            type="button"
            onClick={() => aktion("einreichen")}
            disabled={fehlend.length > 0 || aktionen.aktion.isPending}
            className="rounded-cid bg-ca px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {t("kandidatur.einreichen")}
          </button>
        </div>
      )}
      {["entwurf", "rueckfrage", "eingereicht"].includes(kandidatur.status) && wahl.phase < 3 && (
        <button
          type="button"
          onClick={() => aktion("zurueckziehen")}
          className="text-xs text-status-dangerText underline"
        >
          {t("kandidatur.zurueckziehen")}
        </button>
      )}
    </div>
  );
}

export default function KandidaturTab({ wahl }: { wahl: Wahl }) {
  const { t } = useTranslation("wahlen");
  const anlegen = useKandidaturAnlegen();
  const kandidaturen = useKandidaturen(wahl.id, Boolean(wahl.meine_kandidatur));
  const eigene = kandidaturen.data?.find((k) => k.id === wahl.meine_kandidatur);
  const [fehler, setFehler] = useState("");
  const kannAnlegen = wahl.status === "aktiv" && wahl.phase === 1 && !wahl.ist_ausschuss;

  if (!wahl.meine_kandidatur) {
    return (
      <div className="space-y-3" data-testid="kandidatur-leer">
        <p className="text-sm text-text-secondary">
          {kannAnlegen ? t("kandidatur.start_hinweis") : t("kandidatur.nicht_moeglich")}
        </p>
        {kannAnlegen && (
          <button
            type="button"
            onClick={() =>
              anlegen.mutate(wahl.id, {
                onError: (e) => setFehler(extractApiErrorMessage(e, t("kandidatur.fehler"))),
              })
            }
            disabled={anlegen.isPending}
            className="rounded-cid bg-ca px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {t("kandidatur.starten")}
          </button>
        )}
        {fehler && (
          <p role="alert" className="text-sm text-status-dangerText">
            {fehler}
          </p>
        )}
      </div>
    );
  }
  if (!eigene) return <p className="text-sm text-text-tertiary">{t("laden")}</p>;
  return <Formular key={eigene.id} wahl={wahl} kandidatur={eigene} />;
}
