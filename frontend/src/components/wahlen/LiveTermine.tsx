/**
 * Live-Termine zur Wahl (Vorstellungsrunde, Fragestunde) im Überblick: alle sehen Zeit, Link und
 * Hinweis, tippen „Erinnere mich“ (Zusage im Vereinskalender, Erinnerung 1 Stunde vorher) und
 * laden die Kalenderdatei. Ausschuss und Büro legen die Termine an und ändern sie.
 */
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  useTerminAendern,
  useTerminAnlegen,
  useTerminErinnern,
  useTerminLoeschen,
  useTermine,
} from "../../hooks/useWahlen";
import type { LiveTermin, LiveTerminArt, Wahl } from "../../types/wahlen";
import { extractApiErrorMessage } from "../../utils/apiError";
import { ladeIcsHerunter } from "../../utils/ics";
import { datum } from "../../utils/wahlen";

const ARTEN: LiveTerminArt[] = ["vorstellung", "fragestunde", "sonstiges"];
const CHAMP = "w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm";
const LABEL = "mb-1 block text-xs font-medium text-text-secondary";
const KNOPF =
  "rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-bg-secondary disabled:opacity-40";

/** ISO (UTC) → Wert für <input type="datetime-local"> in lokaler Zeit. */
function isoVersLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localVersIso(wert: string): string {
  return new Date(wert).toISOString();
}

function TerminFormular({
  wahl,
  termin,
  onFertig,
}: {
  wahl: Wahl;
  termin: LiveTermin | null;
  onFertig: () => void;
}) {
  const { t } = useTranslation("wahlen");
  const anlegen = useTerminAnlegen(wahl.id);
  const aendern = useTerminAendern();
  const [art, setArt] = useState<LiveTerminArt>(termin?.art ?? "vorstellung");
  const [titel, setTitel] = useState(termin?.titel ?? t("live.art.vorstellung"));
  const [beginn, setBeginn] = useState(isoVersLocal(termin?.beginn ?? null));
  const [ende, setEnde] = useState(isoVersLocal(termin?.ende ?? null));
  const [link, setLink] = useState(termin?.link ?? "");
  const [hinweis, setHinweis] = useState(termin?.hinweis ?? "");
  const [fehler, setFehler] = useState("");
  const laeuft = anlegen.isPending || aendern.isPending;

  function artWaehlen(neu: LiveTerminArt) {
    // Der vorgeschlagene Titel folgt der Art, solange er nicht selbst geändert wurde.
    if (ARTEN.some((a) => t(`live.art.${a}`) === titel)) setTitel(t(`live.art.${neu}`));
    setArt(neu);
  }

  function senden(e: FormEvent) {
    e.preventDefault();
    setFehler("");
    const payload = {
      art,
      titel,
      beginn: beginn ? localVersIso(beginn) : "",
      ende: ende ? localVersIso(ende) : null,
      link,
      hinweis,
    };
    const optionen = {
      onSuccess: onFertig,
      onError: (err: unknown) => setFehler(extractApiErrorMessage(err, t("live.fehler"))),
    };
    if (termin) aendern.mutate({ id: termin.id, payload }, optionen);
    else anlegen.mutate(payload, optionen);
  }

  return (
    <form
      onSubmit={senden}
      className="space-y-3 rounded-cid bg-bg-secondary p-3"
      data-testid="termin-formular"
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="lt-art">
            {t("live.form.art")}
          </label>
          <select
            id="lt-art"
            className={CHAMP}
            value={art}
            onChange={(e) => artWaehlen(e.target.value as LiveTerminArt)}
          >
            {ARTEN.map((a) => (
              <option key={a} value={a}>
                {t(`live.art.${a}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="lt-titel">
            {t("live.form.titel")}
          </label>
          <input
            id="lt-titel"
            className={CHAMP}
            maxLength={200}
            required
            value={titel}
            onChange={(e) => setTitel(e.target.value)}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="lt-beginn">
            {t("live.form.beginn")}
          </label>
          <input
            id="lt-beginn"
            type="datetime-local"
            className={CHAMP}
            required
            value={beginn}
            onChange={(e) => setBeginn(e.target.value)}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="lt-ende">
            {t("live.form.ende")}
          </label>
          <input
            id="lt-ende"
            type="datetime-local"
            className={CHAMP}
            value={ende}
            onChange={(e) => setEnde(e.target.value)}
          />
        </div>
      </div>
      <div>
        <label className={LABEL} htmlFor="lt-link">
          {t("live.form.link")}
        </label>
        <input
          id="lt-link"
          type="url"
          className={CHAMP}
          placeholder="https://"
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
      </div>
      <div>
        <label className={LABEL} htmlFor="lt-hinweis">
          {t("live.form.hinweis")}
        </label>
        <input
          id="lt-hinweis"
          className={CHAMP}
          maxLength={300}
          value={hinweis}
          onChange={(e) => setHinweis(e.target.value)}
        />
      </div>
      {fehler && (
        <p role="alert" className="text-xs text-status-dangerText">
          {fehler}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={laeuft}
          className="rounded-cid bg-ca px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          {termin ? t("live.form.speichern") : t("live.form.anlegen")}
        </button>
        <button type="button" onClick={onFertig} className={KNOPF}>
          {t("live.form.abbrechen")}
        </button>
      </div>
    </form>
  );
}

function TerminZeile({
  wahl,
  termin,
  intern,
}: {
  wahl: Wahl;
  termin: LiveTermin;
  intern: boolean;
}) {
  const { t } = useTranslation("wahlen");
  const erinnern = useTerminErinnern();
  const loeschen = useTerminLoeschen();
  const [bearbeiten, setBearbeiten] = useState(false);
  const [loeschenFrage, setLoeschenFrage] = useState(false);
  const [fehler, setFehler] = useState("");

  if (bearbeiten) {
    return <TerminFormular wahl={wahl} termin={termin} onFertig={() => setBearbeiten(false)} />;
  }

  function umschalten() {
    setFehler("");
    erinnern.mutate(
      { id: termin.id, an: !termin.erinnert },
      { onError: (err) => setFehler(extractApiErrorMessage(err, t("live.fehler"))) },
    );
  }

  return (
    <li
      className="space-y-2 rounded-cid border border-text-tertiary/15 p-3"
      data-testid="live-termin"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-xs uppercase text-text-tertiary">{t(`live.art.${termin.art}`)}</p>
          <p className="text-sm font-semibold text-text-primary">{termin.titel}</p>
        </div>
        <p className="text-sm text-text-secondary">{datum(termin.beginn, true)}</p>
      </div>
      {termin.hinweis && <p className="text-xs text-text-secondary">{termin.hinweis}</p>}
      {termin.link && (
        <p className="text-sm">
          <a
            href={termin.link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-ca underline"
          >
            {t("live.zum_treffen")}
          </a>
        </p>
      )}
      {termin.vorbei ? (
        <p className="text-xs text-text-tertiary">{t("live.vorbei")}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {termin.im_kalender ? (
            <button
              type="button"
              onClick={umschalten}
              disabled={erinnern.isPending}
              aria-pressed={termin.erinnert}
              className={`${KNOPF} ${termin.erinnert ? "border-ca text-ca" : ""}`}
            >
              {termin.erinnert ? `✓ ${t("live.erinnerung_an")}` : t("live.erinnere_mich")}
            </button>
          ) : (
            <span className="text-xs text-text-tertiary">
              {t("live.erst_nach_veroeffentlichung")}
            </span>
          )}
          <button
            type="button"
            className={KNOPF}
            onClick={() =>
              ladeIcsHerunter({
                id: termin.id,
                objekt_id: termin.id,
                titel: termin.titel,
                beschreibung: termin.hinweis,
                ort: termin.link ? "Video" : "",
                link: termin.link,
                beginn: termin.beginn,
                ende: termin.ende,
                ganztaegig: false,
                wiederholung: "keine",
              })
            }
          >
            📅 {t("live.in_kalender")}
          </button>
        </div>
      )}
      {fehler && (
        <p role="alert" className="text-xs text-status-dangerText">
          {fehler}
        </p>
      )}
      {intern && (
        <div className="flex flex-wrap gap-2 border-t border-text-tertiary/10 pt-2">
          <button type="button" className={KNOPF} onClick={() => setBearbeiten(true)}>
            {t("live.bearbeiten")}
          </button>
          {loeschenFrage ? (
            <>
              <span className="self-center text-xs text-text-secondary">
                {t("live.loeschen_frage")}
              </span>
              <button
                type="button"
                className={`${KNOPF} text-status-dangerText`}
                disabled={loeschen.isPending}
                onClick={() => loeschen.mutate(termin.id)}
              >
                {t("live.loeschen_ja")}
              </button>
              <button type="button" className={KNOPF} onClick={() => setLoeschenFrage(false)}>
                {t("live.form.abbrechen")}
              </button>
            </>
          ) : (
            <button type="button" className={KNOPF} onClick={() => setLoeschenFrage(true)}>
              {t("live.loeschen")}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

export default function LiveTermine({ wahl }: { wahl: Wahl }) {
  const { t } = useTranslation("wahlen");
  const termine = useTermine(wahl.id);
  const [neu, setNeu] = useState(false);
  const intern = wahl.ist_ausschuss || wahl.kann_verwalten;
  const kannAnlegen = intern && wahl.status !== "abgeschlossen";
  const liste = termine.data ?? [];

  if (liste.length === 0 && !kannAnlegen) return null;

  return (
    <section className="space-y-2" data-testid="live-termine">
      <h3 className="text-sm font-semibold">{t("live.titel")}</h3>
      {termine.isLoading && <p className="text-sm text-text-tertiary">{t("laden")}</p>}
      {liste.length > 0 && (
        <ul className="space-y-2">
          {liste.map((x) => (
            <TerminZeile key={x.id} wahl={wahl} termin={x} intern={intern} />
          ))}
        </ul>
      )}
      {liste.length === 0 && !termine.isLoading && (
        <p className="text-sm text-text-secondary">{t("live.keine")}</p>
      )}
      {kannAnlegen &&
        (neu ? (
          <TerminFormular wahl={wahl} termin={null} onFertig={() => setNeu(false)} />
        ) : (
          <button type="button" className={KNOPF} onClick={() => setNeu(true)}>
            + {t("live.neu")}
          </button>
        ))}
    </section>
  );
}
