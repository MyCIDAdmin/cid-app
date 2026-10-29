/** Reiter „Entscheidungen“ : offene und beschlossene Abstimmungen, neue Abstimmung anlegen. */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useEntscheidungAnlegen, useEntscheidungen } from "../../hooks/useReisen";
import { extractApiErrorMessage } from "../../utils/apiError";
import { lokalZuIso } from "../../utils/reisen";
import type { Baustein, EntscheidungTyp, ReiseDetail } from "../../types/reisen";
import EntscheidungKarte from "./EntscheidungKarte";
import { FELD, Fehler, KARTE, KNOPF, KNOPF_LEISE } from "./ui";
import ZielgruppeWahl from "./ZielgruppeWahl";

const TYPEN: EntscheidungTyp[] = ["auswahl", "empfehlung", "termin", "stimmung"];
const BAUSTEINE: Baustein[] = [
  "unterkunft",
  "flug",
  "transport",
  "tickets",
  "programm",
  "sonstiges",
];

interface OptionEntwurf {
  titel: string;
  preis: string;
  entfernung: string;
  von: string;
  bis: string;
}
const LEER: OptionEntwurf = { titel: "", preis: "", entfernung: "", von: "", bis: "" };

function NeueEntscheidung({ reiseId, onFertig }: { reiseId: string; onFertig: () => void }) {
  const { t } = useTranslation("reisen");
  const anlegen = useEntscheidungAnlegen(reiseId);
  const [typ, setTyp] = useState<EntscheidungTyp>("auswahl");
  const [baustein, setBaustein] = useState<Baustein>("unterkunft");
  const [titel, setTitel] = useState("");
  const [frist, setFrist] = useState("");
  const [mehrfach, setMehrfach] = useState(false);
  const [optionen, setOptionen] = useState<OptionEntwurf[]>([{ ...LEER }, { ...LEER }]);
  const [teilgruppe, setTeilgruppe] = useState("");
  const [fehler, setFehler] = useState("");
  const brauchtOptionen = typ !== "stimmung";

  function senden(ev: React.FormEvent) {
    ev.preventDefault();
    if (!titel.trim()) return;
    const gefuellt = optionen.filter((o) => o.titel.trim());
    anlegen.mutate(
      {
        typ,
        baustein,
        titel,
        mehrfach,
        frist: lokalZuIso(frist),
        teilgruppe: teilgruppe || null,
        optionen: brauchtOptionen
          ? gefuellt.map((o) => ({
              titel: o.titel,
              preis: o.preis || null,
              preis_einheit: o.preis ? "person" : "",
              entfernung: o.entfernung,
              von_datum: o.von || null,
              bis_datum: o.bis || null,
            }))
          : [],
      },
      {
        onSuccess: onFertig,
        onError: (e) => setFehler(extractApiErrorMessage(e, t("fehler.allgemein"))),
      },
    );
  }

  const setO = (i: number, teil: Partial<OptionEntwurf>) =>
    setOptionen(optionen.map((o, j) => (i === j ? { ...o, ...teil } : o)));

  return (
    <form onSubmit={senden} className={`${KARTE} space-y-2`} aria-label={t("entscheidung.neu")}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <select
          className={FELD}
          aria-label={t("entscheidung.typ")}
          value={typ}
          onChange={(e) => setTyp(e.target.value as EntscheidungTyp)}
        >
          {TYPEN.map((x) => (
            <option key={x} value={x}>
              {t(`typ.${x}`)}
            </option>
          ))}
        </select>
        <select
          className={FELD}
          aria-label={t("entscheidung.baustein")}
          value={baustein}
          onChange={(e) => setBaustein(e.target.value as Baustein)}
        >
          {BAUSTEINE.map((x) => (
            <option key={x} value={x}>
              {t(`baustein.${x}`)}
            </option>
          ))}
        </select>
        <input
          type="datetime-local"
          className={FELD}
          aria-label={t("entscheidung.frist")}
          value={frist}
          onChange={(e) => setFrist(e.target.value)}
        />
      </div>
      <p className="text-[11px] text-text-tertiary">{t(`typ_hinweis.${typ}`)}</p>
      <input
        className={FELD}
        aria-label={t("entscheidung.titel")}
        placeholder={t("entscheidung.titel")}
        value={titel}
        onChange={(e) => setTitel(e.target.value)}
        required
      />
      {typ === "auswahl" && (
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={mehrfach}
            onChange={(e) => setMehrfach(e.target.checked)}
          />
          {t("entscheidung.mehrfach")}
        </label>
      )}
      {brauchtOptionen && (
        <div className="space-y-1.5">
          {optionen.map((o, i) => (
            <div key={i} className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <input
                className={`${FELD} sm:col-span-2`}
                aria-label={`${t("entscheidung.vorschlag_titel")} ${i + 1}`}
                placeholder={t("entscheidung.vorschlag_titel")}
                value={o.titel}
                onChange={(e) => setO(i, { titel: e.target.value })}
              />
              {typ === "termin" ? (
                <>
                  <input
                    type="date"
                    className={FELD}
                    aria-label={`${t("entscheidung.von")} ${i + 1}`}
                    value={o.von}
                    onChange={(e) => setO(i, { von: e.target.value })}
                  />
                  <input
                    type="date"
                    className={FELD}
                    aria-label={`${t("entscheidung.bis")} ${i + 1}`}
                    value={o.bis}
                    onChange={(e) => setO(i, { bis: e.target.value })}
                  />
                </>
              ) : (
                <>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={FELD}
                    aria-label={`${t("entscheidung.preis")} ${i + 1}`}
                    placeholder={t("entscheidung.preis")}
                    value={o.preis}
                    onChange={(e) => setO(i, { preis: e.target.value })}
                  />
                  <input
                    className={FELD}
                    aria-label={`${t("entscheidung.entfernung")} ${i + 1}`}
                    placeholder={t("entscheidung.entfernung")}
                    value={o.entfernung}
                    onChange={(e) => setO(i, { entfernung: e.target.value })}
                  />
                </>
              )}
            </div>
          ))}
          <button
            type="button"
            className={KNOPF_LEISE}
            onClick={() => setOptionen([...optionen, { ...LEER }])}
          >
            {t("entscheidung.weitere_option")}
          </button>
        </div>
      )}
      <ZielgruppeWahl reiseId={reiseId} value={teilgruppe} onChange={setTeilgruppe} />
      <Fehler text={fehler} />
      <div className="flex gap-2">
        <button type="submit" className={KNOPF} disabled={anlegen.isPending}>
          {t("entscheidung.anlegen")}
        </button>
        <button type="button" className={KNOPF_LEISE} onClick={onFertig}>
          {t("abbrechen")}
        </button>
      </div>
    </form>
  );
}

export default function EntscheidungenTab({ reise }: { reise: ReiseDetail }) {
  const { t } = useTranslation("reisen");
  const q = useEntscheidungen(reise.id);
  const [neu, setNeu] = useState(false);
  const liste = q.data ?? [];
  const offen = liste.filter((e) => e.status !== "beschlossen");
  const fertig = liste.filter((e) => e.status === "beschlossen");

  return (
    <div className="space-y-3">
      {reise.kann_verwalten && !reise.abgesagt && (
        <div>
          {neu ? (
            <NeueEntscheidung reiseId={reise.id} onFertig={() => setNeu(false)} />
          ) : (
            <button type="button" className={KNOPF} onClick={() => setNeu(true)}>
              {t("entscheidung.neu")}
            </button>
          )}
        </div>
      )}
      {!reise.voll && <p className="text-sm text-text-secondary">{t("nur_beschlossenes")}</p>}
      {q.isLoading && <p className="text-sm text-text-tertiary">{t("laden")}</p>}
      {offen.length > 0 && <h2 className="text-sm font-semibold">{t("entscheidung.offen")}</h2>}
      {offen.map((e) => (
        <EntscheidungKarte
          key={e.id}
          reiseId={reise.id}
          e={e}
          kannVerwalten={reise.kann_verwalten}
          vorschlaegeErlaubt={reise.vorschlaege_erlaubt}
          voll={reise.voll}
        />
      ))}
      {fertig.length > 0 && (
        <h2 className="text-sm font-semibold">{t("entscheidung.beschlossen_liste")}</h2>
      )}
      {fertig.map((e) => (
        <EntscheidungKarte
          key={e.id}
          reiseId={reise.id}
          e={e}
          kannVerwalten={reise.kann_verwalten}
          vorschlaegeErlaubt={false}
          voll={reise.voll}
        />
      ))}
      {!q.isLoading && liste.length === 0 && (
        <p className="text-sm text-text-tertiary">{t("entscheidung.leer")}</p>
      )}
    </div>
  );
}
