/** Eine Entscheidung : Optionen, Abstimmen, Vorschlagen, Vergleichen, Beschließen. */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useAbstimmen,
  useBeschliessen,
  useEntscheidungLoeschen,
  useOptionAnlegen,
  useOptionLoeschen,
  useVerlaengern,
} from "../../hooks/useReisen";
import { extractApiErrorMessage } from "../../utils/apiError";
import { datumKurz, lokalZuIso, preisText } from "../../utils/reisen";
import type { Entscheidung, Option, Wert } from "../../types/reisen";
import { Countdown, FELD, Fehler, KARTE, KNOPF, KNOPF_LEISE } from "./ui";
import { GruppenChip } from "./ZielgruppeWahl";

interface Props {
  reiseId: string;
  e: Entscheidung;
  kannVerwalten: boolean;
  vorschlaegeErlaubt: boolean;
  voll: boolean;
}

function OptionZeile({
  o,
  e,
  gewaehlt,
  onWahl,
  sprache,
  kannAbstimmen,
  onLoeschen,
}: {
  o: Option;
  e: Entscheidung;
  gewaehlt: Wert | null;
  onWahl: (w: Wert | null) => void;
  sprache: string;
  kannAbstimmen: boolean;
  onLoeschen: () => void;
}) {
  const { t } = useTranslation("reisen");
  const einfach = e.typ === "auswahl" || e.typ === "empfehlung";
  const werte: Wert[] = ["ja", "vielleicht", "nein"];
  const folgen = o.stimmen.ja;
  return (
    <li
      className={`rounded-cid border p-2 text-sm ${
        gewaehlt ? "border-ca bg-ca/5" : "border-text-tertiary/20"
      } ${e.vorschlag === o.id ? "ring-1 ring-ca" : ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-text-primary">
            {o.titel}
            {e.vorschlag === o.id && (
              <span className="ml-2 rounded-full bg-ca/10 px-2 py-0.5 text-[10px] text-ca">
                {t("entscheidung.vorn")}
              </span>
            )}
            {o.ueber_budget && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">
                {t("entscheidung.ueber_budget")}
              </span>
            )}
          </p>
          <p className="text-xs text-text-secondary">
            {[
              o.preis !== null
                ? preisText(
                    o.preis,
                    o.preis_einheit ? t(`einheit.${o.preis_einheit}`) : "",
                    sprache,
                  )
                : "",
              o.entfernung,
              o.von_datum
                ? `${datumKurz(o.von_datum, sprache)} – ${datumKurz(o.bis_datum ?? o.von_datum, sprache)}`
                : "",
              o.beschreibung,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {o.link && (
            <a
              href={o.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-ca underline"
            >
              {t("entscheidung.link")}
            </a>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-tertiary" data-testid={`stimmen-${o.id}`}>
            {o.stimmen.ja} / {o.stimmen.vielleicht} / {o.stimmen.nein}
          </span>
          {kannAbstimmen &&
            (einfach ? (
              <button
                type="button"
                aria-pressed={gewaehlt === "ja"}
                onClick={() => onWahl(gewaehlt === "ja" ? null : "ja")}
                className={gewaehlt === "ja" ? KNOPF : KNOPF_LEISE}
              >
                {o.ist_selbst ? t("entscheidung.selbst_waehlen") : t("entscheidung.waehlen")}
              </button>
            ) : (
              <div role="group" aria-label={o.titel} className="flex gap-1">
                {werte.map((w) => (
                  <button
                    key={w}
                    type="button"
                    aria-pressed={gewaehlt === w}
                    onClick={() => onWahl(gewaehlt === w ? null : w)}
                    className={gewaehlt === w ? KNOPF : KNOPF_LEISE}
                  >
                    {t(`wert.${w}`)}
                  </button>
                ))}
              </div>
            ))}
          {o.kann_loeschen && !o.ist_selbst && e.status !== "beschlossen" && (
            <button
              type="button"
              onClick={onLoeschen}
              className="text-xs text-red-600"
              aria-label={t("loeschen")}
            >
              ×
            </button>
          )}
        </div>
      </div>
      {o.waehler && folgen + o.stimmen.vielleicht > 0 && (
        <p className="mt-1 text-[11px] text-text-tertiary">
          {(["ja", "vielleicht"] as Wert[])
            .filter((w) => o.waehler?.[w]?.length)
            .map((w) => `${t(`wert.${w}`)}: ${o.waehler?.[w].join(", ")}`)
            .join(" · ")}
        </p>
      )}
    </li>
  );
}

export default function EntscheidungKarte({
  reiseId,
  e,
  kannVerwalten,
  vorschlaegeErlaubt,
  voll,
}: Props) {
  const { t, i18n } = useTranslation("reisen");
  const abstimmen = useAbstimmen(reiseId);
  const beschliessen = useBeschliessen(reiseId);
  const verlaengern = useVerlaengern(reiseId);
  const optionAnlegen = useOptionAnlegen(reiseId);
  const optionLoeschen = useOptionLoeschen(reiseId);
  const loeschen = useEntscheidungLoeschen(reiseId);
  const [fehler, setFehler] = useState("");
  const [neu, setNeu] = useState({ titel: "", preis: "", entfernung: "", von: "", bis: "" });
  const [zeigeNeu, setZeigeNeu] = useState(false);
  const [begruendung, setBegruendung] = useState("");
  const [neueFrist, setNeueFrist] = useState("");

  const geschlossen = e.status !== "offen";
  const kannAbstimmen = voll && !geschlossen;
  const meine = new Map(e.optionen.filter((o) => o.meine).map((o) => [o.id, o.meine as Wert]));
  const fehlerText = (err: unknown) => extractApiErrorMessage(err, t("fehler.allgemein"));

  function waehle(o: Option, w: Wert | null) {
    const neueWahl = new Map(meine);
    if (w === null) neueWahl.delete(o.id);
    else if (e.typ === "termin" || e.mehrfach || e.typ === "stimmung") {
      if (e.typ === "stimmung") neueWahl.clear();
      neueWahl.set(o.id, w);
    } else {
      neueWahl.clear();
      neueWahl.set(o.id, w);
    }
    abstimmen.mutate(
      { eid: e.id, stimmen: [...neueWahl].map(([option, wert]) => ({ option, wert })) },
      { onError: (err) => setFehler(fehlerText(err)), onSuccess: () => setFehler("") },
    );
  }

  function beschliesse(optionId: string | null) {
    beschliessen.mutate(
      { eid: e.id, option: optionId, begruendung },
      { onError: (err) => setFehler(fehlerText(err)), onSuccess: () => setFehler("") },
    );
  }

  function vorschlagen(ev: React.FormEvent) {
    ev.preventDefault();
    if (!neu.titel.trim()) return;
    optionAnlegen.mutate(
      {
        eid: e.id,
        daten: {
          titel: neu.titel,
          preis: neu.preis || null,
          preis_einheit: neu.preis ? "person" : "",
          entfernung: neu.entfernung,
          von_datum: neu.von || null,
          bis_datum: neu.bis || null,
        },
      },
      {
        onSuccess: () => {
          setNeu({ titel: "", preis: "", entfernung: "", von: "", bis: "" });
          setZeigeNeu(false);
          setFehler("");
        },
        onError: (err) => setFehler(fehlerText(err)),
      },
    );
  }

  return (
    <article className={KARTE} data-testid={`entscheidung-${e.id}`}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">
            {e.titel} <GruppenChip name={e.teilgruppe_name} />
          </h3>
          <p className="text-[11px] text-text-tertiary">
            {t(`typ.${e.typ}`)} · {t(`baustein.${e.baustein}`)} ·{" "}
            {t("entscheidung.teilgenommen", { n: e.teilgenommen })}
          </p>
        </div>
        <div className="text-right">
          {e.status === "beschlossen" ? (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] text-green-800">
              {t("entscheidung.beschlossen")}
            </span>
          ) : e.status === "geschlossen" ? (
            <span className="rounded-full bg-bg-tertiary px-2 py-0.5 text-[11px]">
              {t("entscheidung.geschlossen")}
            </span>
          ) : (
            <Countdown frist={e.frist} />
          )}
          {voll && e.status === "offen" && !e.ich_habe_abgestimmt && (
            <p className="text-[11px] text-amber-700">{t("entscheidung.noch_nicht_abgestimmt")}</p>
          )}
        </div>
      </header>
      {e.beschreibung && <p className="mt-1 text-xs text-text-secondary">{e.beschreibung}</p>}

      {e.beschluss && (
        <p
          className="mt-2 rounded-cid bg-green-50 p-2 text-sm text-green-900"
          data-testid="beschluss"
        >
          {e.beschluss.titel ?? t("entscheidung.ohne_option")}
          {e.beschluss.begruendung && (
            <span className="block text-xs">{e.beschluss.begruendung}</span>
          )}
          {e.typ === "empfehlung" && (
            <span className="block text-xs">
              {t("entscheidung.folgen", { n: e.beschluss.folgen })}
            </span>
          )}
        </p>
      )}

      {voll && (
        <ul className="mt-2 space-y-1.5">
          {e.optionen.map((o) => (
            <OptionZeile
              key={o.id}
              o={o}
              e={e}
              gewaehlt={meine.get(o.id) ?? null}
              onWahl={(w) => waehle(o, w)}
              sprache={i18n.language}
              kannAbstimmen={kannAbstimmen}
              onLoeschen={() => optionLoeschen.mutate(o.id)}
            />
          ))}
        </ul>
      )}

      <Fehler text={fehler} />

      {voll && !geschlossen && e.typ !== "stimmung" && (kannVerwalten || vorschlaegeErlaubt) && (
        <div className="mt-2">
          {zeigeNeu ? (
            <form onSubmit={vorschlagen} className="grid grid-cols-2 gap-2">
              <input
                className={`${FELD} col-span-2`}
                aria-label={t("entscheidung.vorschlag_titel")}
                placeholder={t("entscheidung.vorschlag_titel")}
                value={neu.titel}
                onChange={(ev) => setNeu({ ...neu, titel: ev.target.value })}
              />
              {e.typ === "termin" ? (
                <>
                  <input
                    type="date"
                    className={FELD}
                    aria-label={t("entscheidung.von")}
                    value={neu.von}
                    onChange={(ev) => setNeu({ ...neu, von: ev.target.value })}
                  />
                  <input
                    type="date"
                    className={FELD}
                    aria-label={t("entscheidung.bis")}
                    value={neu.bis}
                    onChange={(ev) => setNeu({ ...neu, bis: ev.target.value })}
                  />
                </>
              ) : (
                <>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={FELD}
                    aria-label={t("entscheidung.preis")}
                    placeholder={t("entscheidung.preis")}
                    value={neu.preis}
                    onChange={(ev) => setNeu({ ...neu, preis: ev.target.value })}
                  />
                  <input
                    className={FELD}
                    aria-label={t("entscheidung.entfernung")}
                    placeholder={t("entscheidung.entfernung")}
                    value={neu.entfernung}
                    onChange={(ev) => setNeu({ ...neu, entfernung: ev.target.value })}
                  />
                </>
              )}
              <div className="col-span-2 flex gap-2">
                <button type="submit" className={KNOPF}>
                  {t("entscheidung.vorschlagen")}
                </button>
                <button type="button" className={KNOPF_LEISE} onClick={() => setZeigeNeu(false)}>
                  {t("abbrechen")}
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className={KNOPF_LEISE} onClick={() => setZeigeNeu(true)}>
              {t("entscheidung.vorschlag_hinzufuegen")}
            </button>
          )}
        </div>
      )}

      {kannVerwalten && e.status !== "beschlossen" && (
        <div className="mt-3 space-y-2 border-t border-text-tertiary/15 pt-2">
          <input
            className={FELD}
            aria-label={t("entscheidung.begruendung")}
            placeholder={t("entscheidung.begruendung")}
            value={begruendung}
            onChange={(ev) => setBegruendung(ev.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            {e.vorschlag && (
              <button type="button" className={KNOPF} onClick={() => beschliesse(e.vorschlag)}>
                {t("entscheidung.vorschlag_uebernehmen")}
              </button>
            )}
            {e.typ === "stimmung" && (
              <button type="button" className={KNOPF} onClick={() => beschliesse(null)}>
                {t("entscheidung.beenden")}
              </button>
            )}
            <input
              type="datetime-local"
              className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs"
              aria-label={t("entscheidung.neue_frist")}
              value={neueFrist}
              onChange={(ev) => setNeueFrist(ev.target.value)}
            />
            <button
              type="button"
              className={KNOPF_LEISE}
              disabled={!neueFrist}
              onClick={() => {
                const iso = lokalZuIso(neueFrist);
                if (iso)
                  verlaengern.mutate(
                    { eid: e.id, frist: iso },
                    { onError: (err) => setFehler(fehlerText(err)) },
                  );
              }}
            >
              {t("entscheidung.verlaengern")}
            </button>
            <button
              type="button"
              className="text-xs text-red-600"
              onClick={() => loeschen.mutate(e.id)}
            >
              {t("loeschen")}
            </button>
          </div>
          {e.typ !== "stimmung" && (
            <div className="flex flex-wrap gap-1">
              {e.optionen
                .filter((o) => !o.ist_selbst)
                .map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={KNOPF_LEISE}
                    onClick={() => beschliesse(o.id)}
                  >
                    {t("entscheidung.beschliessen_mit", { titel: o.titel })}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
