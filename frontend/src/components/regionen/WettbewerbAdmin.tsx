/** App Admin : Saisons anlegen/ändern/einfrieren, Punkte nachbuchen und die Punkte-Regeln. */
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  usePunkteNachbuchen,
  useRegelnSpeichern,
  useSaisonAendern,
  useSaisonAnlegen,
  useSaisonEinfrieren,
  useSaisonLoeschen,
} from "../../hooks/useRegionen";
import type { WettbewerbRegeln, WettbewerbSaison } from "../../types/regionen";
import { extractApiErrorMessage } from "../../utils/apiError";

const FELD =
  "w-full rounded-cid border border-text-tertiary/20 bg-bg-secondary px-3 py-2 text-sm text-text-primary";
const KNOPF =
  "rounded-cid px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-bg-secondary disabled:opacity-50";

const REGEL_FELDER: (keyof WettbewerbRegeln)[] = [
  "punkte_veranstaltung",
  "punkte_anwesend",
  "max_anwesende",
  "punkte_erstteilnehmer",
  "punkte_neumitglied",
  "max_treffen_monat",
];

function heuteIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function SaisonFormular({
  bestehend,
  onFertig,
}: {
  bestehend?: WettbewerbSaison;
  onFertig: () => void;
}) {
  const { t } = useTranslation("regionen");
  const anlegen = useSaisonAnlegen();
  const aendern = useSaisonAendern();
  const [name, setName] = useState(bestehend?.name ?? "");
  const [start, setStart] = useState(bestehend?.start ?? "");
  const [ende, setEnde] = useState(bestehend?.ende ?? "");
  const [preis, setPreis] = useState(bestehend?.preis ?? "");
  const [fehler, setFehler] = useState<string | null>(null);

  function senden(e: FormEvent) {
    e.preventDefault();
    setFehler(null);
    const daten = { name: name.trim(), start, ende, preis: preis.trim() };
    const optionen = {
      onSuccess: () => {
        if (!bestehend) {
          setName("");
          setStart("");
          setEnde("");
          setPreis("");
        }
        onFertig();
      },
      onError: (err: unknown) => setFehler(extractApiErrorMessage(err, t("fehler_speichern"))),
    };
    if (bestehend) aendern.mutate({ id: bestehend.id, daten }, optionen);
    else anlegen.mutate(daten, optionen);
  }

  return (
    <form onSubmit={senden} className="flex flex-col gap-2">
      <input
        className={FELD}
        aria-label={t("wettbewerb.saison_name")}
        placeholder={t("wettbewerb.saison_name")}
        maxLength={100}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs font-semibold text-text-tertiary">
          {t("wettbewerb.saison_start")}
          <input
            type="date"
            className={`${FELD} mt-1 font-normal`}
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label className="text-xs font-semibold text-text-tertiary">
          {t("wettbewerb.saison_ende")}
          <input
            type="date"
            className={`${FELD} mt-1 font-normal`}
            value={ende}
            onChange={(e) => setEnde(e.target.value)}
          />
        </label>
      </div>
      <textarea
        className={FELD}
        rows={2}
        aria-label={t("wettbewerb.saison_preis")}
        placeholder={t("wettbewerb.saison_preis")}
        maxLength={500}
        value={preis}
        onChange={(e) => setPreis(e.target.value)}
      />
      {fehler && <p className="text-sm text-status-dangerText">{fehler}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!name.trim() || !start || !ende || anlegen.isPending || aendern.isPending}
          className="rounded-cid bg-ca px-4 py-2 text-sm font-medium text-white hover:bg-cad disabled:opacity-50"
        >
          {bestehend ? t("speichern") : t("wettbewerb.saison_anlegen")}
        </button>
        {bestehend && (
          <button type="button" onClick={onFertig} className={KNOPF}>
            {t("abbrechen")}
          </button>
        )}
      </div>
    </form>
  );
}

function SaisonZeile({ saison }: { saison: WettbewerbSaison }) {
  const { t } = useTranslation("regionen");
  const einfrieren = useSaisonEinfrieren();
  const nachbuchen = usePunkteNachbuchen();
  const loeschen = useSaisonLoeschen();
  const [bearbeiten, setBearbeiten] = useState(false);
  const [frage, setFrage] = useState<"einfrieren" | "loeschen" | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const beendet = saison.ende < heuteIso();
  const bei = (err: unknown) => setFehler(extractApiErrorMessage(err, t("fehler_speichern")));

  function bestaetigen() {
    setFehler(null);
    const aktion = frage === "einfrieren" ? einfrieren : loeschen;
    aktion.mutate(saison.id, { onSuccess: () => setFrage(null), onError: bei });
  }

  return (
    <li className="flex flex-col gap-2 py-3">
      {bearbeiten ? (
        <SaisonFormular bestehend={saison} onFertig={() => setBearbeiten(false)} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium text-text-primary">{saison.name}</span>
            <span className="text-xs text-text-tertiary">
              {saison.start} – {saison.ende}
            </span>
            <span className="rounded-full bg-bg-secondary px-2 py-0.5 text-xs font-semibold text-text-secondary">
              {saison.eingefroren
                ? t("wettbewerb.status_eingefroren")
                : saison.laufend
                  ? t("wettbewerb.status_laufend")
                  : beendet
                    ? t("wettbewerb.status_beendet")
                    : t("wettbewerb.status_geplant")}
            </span>
          </div>
          {!saison.eingefroren && frage === null && (
            <div className="flex flex-wrap gap-1">
              <button type="button" className={KNOPF} onClick={() => setBearbeiten(true)}>
                {t("wettbewerb.saison_bearbeiten")}
              </button>
              <button
                type="button"
                className={KNOPF}
                disabled={nachbuchen.isPending}
                onClick={() => {
                  setFehler(null);
                  nachbuchen.mutate(saison.id, {
                    onSuccess: (r) => setMeldung(t("wettbewerb.nachgebucht", { count: r.gebucht })),
                    onError: bei,
                  });
                }}
              >
                {t("wettbewerb.nachbuchen")}
              </button>
              {beendet && (
                <button type="button" className={KNOPF} onClick={() => setFrage("einfrieren")}>
                  {t("wettbewerb.einfrieren")}
                </button>
              )}
              <button type="button" className={KNOPF} onClick={() => setFrage("loeschen")}>
                {t("wettbewerb.saison_loeschen")}
              </button>
            </div>
          )}
          {frage && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
              <span>
                {frage === "einfrieren"
                  ? t("wettbewerb.einfrieren_frage")
                  : t("wettbewerb.loeschen_frage")}
              </span>
              <button
                type="button"
                className="rounded-cid bg-ca px-3 py-1.5 text-xs font-semibold text-white hover:bg-cad"
                onClick={bestaetigen}
              >
                {t("wettbewerb.bestaetigen")}
              </button>
              <button type="button" className={KNOPF} onClick={() => setFrage(null)}>
                {t("abbrechen")}
              </button>
            </div>
          )}
          {meldung && <p className="text-xs text-text-secondary">{meldung}</p>}
          {fehler && <p className="text-sm text-status-dangerText">{fehler}</p>}
        </>
      )}
    </li>
  );
}

function RegelnFormular({ regeln }: { regeln: WettbewerbRegeln }) {
  const { t } = useTranslation("regionen");
  const speichern = useRegelnSpeichern();
  const [werte, setWerte] = useState<Record<string, string>>({});
  const [fehler, setFehler] = useState<string | null>(null);
  const [gespeichert, setGespeichert] = useState(false);

  useEffect(() => {
    setWerte(Object.fromEntries(REGEL_FELDER.map((f) => [f, String(regeln[f])])));
  }, [regeln]);

  function senden(e: FormEvent) {
    e.preventDefault();
    setFehler(null);
    setGespeichert(false);
    const neu = Object.fromEntries(
      REGEL_FELDER.map((f) => [f, Number(werte[f])]),
    ) as unknown as WettbewerbRegeln;
    speichern.mutate(neu, {
      onSuccess: () => setGespeichert(true),
      onError: (err) => setFehler(extractApiErrorMessage(err, t("fehler_speichern"))),
    });
  }

  return (
    <form onSubmit={senden} className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {REGEL_FELDER.map((f) => (
          <label key={f} className="text-xs font-semibold text-text-tertiary">
            {t(`wettbewerb.regel.${f}`)}
            <input
              type="number"
              min={0}
              step={1}
              className={`${FELD} mt-1 font-normal`}
              value={werte[f] ?? ""}
              onChange={(e) => setWerte({ ...werte, [f]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <p className="text-xs text-text-tertiary">{t("wettbewerb.regeln_hinweis")}</p>
      {fehler && <p className="text-sm text-status-dangerText">{fehler}</p>}
      {gespeichert && <p className="text-sm text-text-secondary">{t("wettbewerb.gespeichert")}</p>}
      <div>
        <button
          type="submit"
          disabled={speichern.isPending}
          className="rounded-cid bg-ca px-4 py-2 text-sm font-medium text-white hover:bg-cad disabled:opacity-50"
        >
          {t("speichern")}
        </button>
      </div>
    </form>
  );
}

export default function WettbewerbAdmin({
  saisons,
  regeln,
}: {
  saisons: WettbewerbSaison[];
  regeln: WettbewerbRegeln;
}) {
  const { t } = useTranslation("regionen");
  return (
    <section className="flex flex-col gap-5 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
      <h2 className="text-base font-semibold text-text-primary">{t("wettbewerb.admin_titel")}</h2>
      <div>
        <h3 className="mb-1 text-sm font-semibold text-text-primary">{t("wettbewerb.saisons")}</h3>
        {saisons.length > 0 && (
          <ul className="mb-3 divide-y divide-text-tertiary/10">
            {saisons.map((s) => (
              <SaisonZeile key={s.id} saison={s} />
            ))}
          </ul>
        )}
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
          {t("wettbewerb.saison_neu")}
        </h4>
        <SaisonFormular onFertig={() => undefined} />
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-text-primary">{t("wettbewerb.regeln")}</h3>
        <RegelnFormular regeln={regeln} />
      </div>
    </section>
  );
}
