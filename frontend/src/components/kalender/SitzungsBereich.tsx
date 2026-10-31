/**
 * Sitzungsmodus (Release 18) : Tagesordnung, Protokoll und Beschlüsse zu einem Termin. Aus einem
 * Beschluss wird mit einem Klick eine Aufgabe in einem Projekt ; die Zusammenfassung geht per
 * E-Mail an alle Eingeladenen.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useBeschlussErstellen,
  useBeschlussLoeschen,
  useBeschlussZuAufgabe,
  useProtokollVersenden,
  useSitzung,
  useSitzungSpeichern,
} from "../../hooks/useKalender";
import { useProjets } from "../../hooks/useProjets";
import type { Beschluss, Person, Tagesordnungspunkt } from "../../types/kalender";
import { extractApiErrorMessage } from "../../utils/apiError";
import PersonenWahl from "./PersonenWahl";
import { lokaleSprache } from "../../utils/datum";

const FELD = "w-full rounded-cid border border-text-tertiary/30 bg-bg-primary px-2 py-1.5 text-sm";
const KNOPF = "rounded-cid border border-text-tertiary/30 px-3 py-1 text-xs font-semibold";

function AufgabeAnlegen({
  beschluss,
  terminId,
  standardProjekt,
  onFertig,
}: {
  beschluss: Beschluss;
  terminId: string;
  standardProjekt: string | null;
  onFertig: (fehler: string) => void;
}) {
  const { t } = useTranslation("kalender");
  const projekte = useProjets({});
  const aufgabe = useBeschlussZuAufgabe();
  const [projekt, setProjekt] = useState(standardProjekt ?? "");
  const [frist, setFrist] = useState(beschluss.frist ?? "");
  const [person, setPerson] = useState<Person[]>(
    beschluss.verantwortlich
      ? [{ user: beschluss.verantwortlich, name: beschluss.verantwortlich_name }]
      : [],
  );

  function anlegen() {
    aufgabe
      .mutateAsync({
        terminId,
        beschlussId: beschluss.id,
        projekt: projekt || null,
        verantwortlich: person[0]?.user ?? null,
        frist: frist || null,
      })
      .then(() => onFertig(""))
      .catch((e) => onFertig(extractApiErrorMessage(e, t("fehler_aktion"))));
  }

  return (
    <div className="mt-2 space-y-2 rounded-cid border border-text-tertiary/20 p-2">
      <select
        aria-label={t("sitzung.projekt")}
        className={FELD}
        value={projekt}
        onChange={(e) => setProjekt(e.target.value)}
      >
        <option value="">{t("sitzung.projekt_waehlen")}</option>
        {(projekte.data?.results ?? []).map((p) => (
          <option key={p.id} value={p.id}>
            {p.titre}
          </option>
        ))}
      </select>
      <PersonenWahl
        einzeln
        gewaehlt={person}
        onChange={setPerson}
        platzhalter={t("sitzung.verantwortlich")}
      />
      <input
        type="date"
        aria-label={t("sitzung.frist")}
        className={FELD}
        value={frist}
        onChange={(e) => setFrist(e.target.value)}
      />
      <button
        type="button"
        disabled={aufgabe.isPending || !projekt}
        onClick={anlegen}
        className={`${KNOPF} bg-ca text-white`}
      >
        {t("sitzung.aufgabe_anlegen")}
      </button>
    </div>
  );
}

export default function SitzungsBereich({ terminId }: { terminId: string }) {
  const { t } = useTranslation("kalender");
  const sitzung = useSitzung(terminId, true);
  const speichern = useSitzungSpeichern();
  const erstellen = useBeschlussErstellen();
  const loeschen = useBeschlussLoeschen();
  const versenden = useProtokollVersenden();
  const [tops, setTops] = useState<Tagesordnungspunkt[]>([]);
  const [protokoll, setProtokoll] = useState("");
  const [neuerBeschluss, setNeuerBeschluss] = useState("");
  const [aufgabeFuer, setAufgabeFuer] = useState<string | null>(null);
  const [meldung, setMeldung] = useState("");
  const [fehler, setFehler] = useState("");
  const daten = sitzung.data;

  useEffect(() => {
    if (daten) {
      setTops(daten.tops);
      setProtokoll(daten.protokoll);
    }
  }, [daten]);

  if (sitzung.isLoading) return <p className="text-xs text-text-tertiary">{t("laden")}</p>;
  if (!daten) return <p className="text-xs text-status-dangerText">{t("fehler_laden")}</p>;
  const bearbeiten = daten.darf_bearbeiten;

  function ausfuehren(promise: Promise<unknown>, ok?: string, nachher?: () => void) {
    setFehler("");
    setMeldung("");
    promise
      .then(() => {
        if (ok) setMeldung(ok);
        nachher?.();
      })
      .catch((e) => setFehler(extractApiErrorMessage(e, t("fehler_aktion"))));
  }

  return (
    <div className="space-y-4" data-testid="sitzungsbereich">
      <section>
        <h3 className="mb-1 text-xs font-bold text-text-tertiary">{t("sitzung.tagesordnung")}</h3>
        {!bearbeiten ? (
          <ol className="list-decimal ps-5 text-sm text-text-primary">
            {daten.tops.map((p) => (
              <li key={p.id}>{p.titel}</li>
            ))}
          </ol>
        ) : (
          <div className="space-y-1">
            {tops.map((p, i) => (
              <div key={p.id ?? `neu-${i}`} className="flex items-center gap-1">
                <span className="w-5 text-xs text-text-tertiary">{i + 1}.</span>
                <input
                  className={FELD}
                  aria-label={t("sitzung.punkt", { nr: i + 1 })}
                  value={p.titel}
                  onChange={(e) =>
                    setTops((l) => l.map((x, j) => (j === i ? { ...x, titel: e.target.value } : x)))
                  }
                />
                <button
                  type="button"
                  aria-label={t("sitzung.punkt_entfernen")}
                  onClick={() => setTops((l) => l.filter((_x, j) => j !== i))}
                  className="px-1 text-text-tertiary"
                >
                  ✕
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <button
                type="button"
                className={KNOPF}
                onClick={() => setTops((l) => [...l, { titel: "", beschreibung: "" }])}
              >
                + {t("sitzung.punkt_hinzu")}
              </button>
              <button
                type="button"
                className={`${KNOPF} bg-ca text-white`}
                disabled={speichern.isPending}
                onClick={() =>
                  ausfuehren(
                    speichern.mutateAsync({ terminId, v: { tops } }),
                    t("sitzung.gespeichert"),
                  )
                }
              >
                {t("sitzung.speichern")}
              </button>
            </div>
          </div>
        )}
      </section>

      {daten.darf_protokoll_sehen && (
        <>
          <section>
            <h3 className="mb-1 text-xs font-bold text-text-tertiary">{t("sitzung.protokoll")}</h3>
            {bearbeiten ? (
              <>
                <textarea
                  className={`${FELD} min-h-[120px]`}
                  aria-label={t("sitzung.protokoll")}
                  value={protokoll}
                  onChange={(e) => setProtokoll(e.target.value)}
                />
                <button
                  type="button"
                  className={`${KNOPF} mt-1 bg-ca text-white`}
                  disabled={speichern.isPending}
                  onClick={() =>
                    ausfuehren(
                      speichern.mutateAsync({ terminId, v: { protokoll } }),
                      t("sitzung.gespeichert"),
                    )
                  }
                >
                  {t("sitzung.speichern")}
                </button>
              </>
            ) : (
              <p className="whitespace-pre-line text-sm text-text-primary">
                {daten.protokoll || t("sitzung.kein_protokoll")}
              </p>
            )}
          </section>

          <section>
            <h3 className="mb-1 text-xs font-bold text-text-tertiary">
              {t("sitzung.beschluesse")}
            </h3>
            <ul className="space-y-2">
              {daten.beschluesse.map((b) => (
                <li key={b.id} className="rounded-cid border border-text-tertiary/20 p-2 text-sm">
                  <p className="text-text-primary">{b.text}</p>
                  <p className="text-xs text-text-secondary">
                    {b.verantwortlich_name && `${b.verantwortlich_name} · `}
                    {b.frist && `${t("sitzung.bis")} ${b.frist}`}
                  </p>
                  {b.aufgabe ? (
                    <p className="text-xs text-status-successText">✓ {t("sitzung.ist_aufgabe")}</p>
                  ) : (
                    bearbeiten && (
                      <div className="mt-1 flex gap-2">
                        <button
                          type="button"
                          className={KNOPF}
                          onClick={() => setAufgabeFuer(aufgabeFuer === b.id ? null : b.id)}
                        >
                          {t("sitzung.zur_aufgabe")}
                        </button>
                        <button
                          type="button"
                          className={`${KNOPF} text-status-dangerText`}
                          onClick={() => ausfuehren(loeschen.mutateAsync({ terminId, v: b.id }))}
                        >
                          {t("sitzung.loeschen")}
                        </button>
                      </div>
                    )
                  )}
                  {aufgabeFuer === b.id && (
                    <AufgabeAnlegen
                      beschluss={b}
                      terminId={terminId}
                      standardProjekt={daten.projekt}
                      onFertig={(f) => {
                        setFehler(f);
                        if (!f) setAufgabeFuer(null);
                      }}
                    />
                  )}
                </li>
              ))}
            </ul>
            {bearbeiten && (
              <div className="mt-2 flex gap-2">
                <input
                  className={FELD}
                  aria-label={t("sitzung.beschluss_text")}
                  placeholder={t("sitzung.beschluss_text")}
                  value={neuerBeschluss}
                  onChange={(e) => setNeuerBeschluss(e.target.value)}
                />
                <button
                  type="button"
                  className={`${KNOPF} shrink-0`}
                  disabled={!neuerBeschluss.trim() || erstellen.isPending}
                  onClick={() =>
                    ausfuehren(
                      erstellen.mutateAsync({ terminId, v: { text: neuerBeschluss.trim() } }),
                      undefined,
                      () => setNeuerBeschluss(""),
                    )
                  }
                >
                  + {t("sitzung.beschluss_hinzu")}
                </button>
              </div>
            )}
          </section>

          {bearbeiten && (
            <section>
              <button
                type="button"
                className={`${KNOPF} bg-ca text-white`}
                disabled={versenden.isPending}
                onClick={() =>
                  ausfuehren(
                    versenden.mutateAsync({ terminId, v: undefined }),
                    t("sitzung.versendet"),
                  )
                }
              >
                ✉ {t("sitzung.versenden")}
              </button>
              {daten.versendet_am && (
                <span className="ms-2 text-xs text-text-tertiary">
                  {t("sitzung.zuletzt_versendet", {
                    datum: new Date(daten.versendet_am).toLocaleString(lokaleSprache()),
                  })}
                </span>
              )}
            </section>
          )}
        </>
      )}
      {meldung && <p className="text-xs text-status-successText">{meldung}</p>}
      {fehler && <p className="text-xs text-status-dangerText">{fehler}</p>}
    </div>
  );
}
