/**
 * Dienste (Helfer-Slots) eines Termins oder einer Veranstaltung (Release 16) : Besetzung
 * („2 von 3 besetzt“), Eintragen/Austragen per Klick ; mit Schreibrecht außerdem Anlegen,
 * Personen zuweisen oder entfernen und Vorschläge aus der Fähigkeiten-Datenbank anschreiben.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useDienstAktion,
  useDienstAnschreiben,
  useDienstErstellen,
  useDienstLoeschen,
  useDienstVorschlaege,
  useDienste,
  usePersonenSuche,
} from "../../hooks/useKalender";
import { useFaehigkeitenKatalog } from "../../hooks/useFaehigkeiten";
import type { Dienst } from "../../types/kalender";
import { extractApiErrorMessage } from "../../utils/apiError";
import { formatDienstZeit, vonLokalInput } from "../../utils/kalender";
import Besetzung from "./Besetzung";

const KNOPF = "rounded-cid border border-text-tertiary/30 px-2 py-0.5 text-xs font-semibold";
const FELD = "w-full rounded-cid border border-text-tertiary/30 bg-bg-primary px-2 py-1 text-sm";

function PersonenZuweisung({ dienst }: { dienst: Dienst }) {
  const { t } = useTranslation("kalender");
  const aktion = useDienstAktion();
  const anschreiben = useDienstAnschreiben();
  const [suche, setSuche] = useState("");
  const [vorschlaege, setVorschlaege] = useState(false);
  const treffer = usePersonenSuche(suche);
  const liste = useDienstVorschlaege(dienst.id, vorschlaege && Boolean(dienst.faehigkeit));
  const [fehler, setFehler] = useState("");

  const ausfuehren = (p: Promise<unknown>) =>
    p
      .then(() => setFehler(""))
      .catch((e) => setFehler(extractApiErrorMessage(e, t("fehler_aktion"))));

  return (
    <div className="mt-2 space-y-2 rounded-cid bg-bg-secondary p-2">
      {dienst.eingetragen.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {dienst.eingetragen.map((p) => (
            <li key={p.user}>
              <button
                type="button"
                aria-label={t("dienste.entfernen", { name: p.name })}
                onClick={() =>
                  ausfuehren(
                    aktion.mutateAsync({ id: dienst.id, aktion: "entfernen", user: p.user }),
                  )
                }
                className="rounded-full bg-bg-tertiary px-2 py-0.5 text-xs"
              >
                {p.name} ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        className={FELD}
        value={suche}
        placeholder={t("dienste.person_zuweisen")}
        onChange={(e) => setSuche(e.target.value)}
      />
      {suche.trim().length >= 2 && (
        <ul>
          {(treffer.data ?? []).map((p) => (
            <li key={p.user}>
              <button
                type="button"
                className="block w-full px-2 py-1 text-start text-sm hover:bg-bg-tertiary"
                onClick={() => {
                  setSuche("");
                  ausfuehren(
                    aktion.mutateAsync({ id: dienst.id, aktion: "zuweisen", user: p.user }),
                  );
                }}
              >
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {dienst.faehigkeit && (
        <div>
          <button type="button" className={KNOPF} onClick={() => setVorschlaege((v) => !v)}>
            {t("dienste.vorschlaege", { faehigkeit: dienst.faehigkeit_name })}
          </button>
          {vorschlaege && (
            <ul className="mt-1 space-y-1">
              {(liste.data ?? []).length === 0 && (
                <li className="text-xs text-text-tertiary">{t("dienste.keine_vorschlaege")}</li>
              )}
              {(liste.data ?? []).map((p) => (
                <li key={p.user} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    {p.name}
                    {p.kommentar ? ` – ${p.kommentar}` : ""}
                  </span>
                  <span className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      className={KNOPF}
                      onClick={() =>
                        ausfuehren(anschreiben.mutateAsync({ id: dienst.id, user: p.user }))
                      }
                    >
                      {anschreiben.isSuccess && anschreiben.variables?.user === p.user
                        ? t("dienste.angeschrieben")
                        : t("dienste.anschreiben")}
                    </button>
                    <button
                      type="button"
                      className={KNOPF}
                      onClick={() =>
                        ausfuehren(
                          aktion.mutateAsync({ id: dienst.id, aktion: "zuweisen", user: p.user }),
                        )
                      }
                    >
                      {t("dienste.zuweisen")}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {fehler && <p className="text-xs text-status-dangerText">{fehler}</p>}
    </div>
  );
}

function DienstNeu({
  termin,
  evenement,
  onFertig,
}: {
  termin?: string;
  evenement?: string;
  onFertig: () => void;
}) {
  const { t } = useTranslation("kalender");
  const erstellen = useDienstErstellen();
  const katalog = useFaehigkeitenKatalog();
  const [titel, setTitel] = useState("");
  const [beginn, setBeginn] = useState("");
  const [ende, setEnde] = useState("");
  const [benoetigt, setBenoetigt] = useState(2);
  const [faehigkeit, setFaehigkeit] = useState("");
  const [bis, setBis] = useState("");
  const [fehler, setFehler] = useState("");

  async function speichern(e: React.FormEvent) {
    e.preventDefault();
    setFehler("");
    try {
      await erstellen.mutateAsync({
        termin: termin ?? null,
        evenement: evenement ?? null,
        titel: titel.trim(),
        beschreibung: "",
        beginn: vonLokalInput(beginn) ?? "",
        ende: vonLokalInput(ende),
        benoetigt,
        faehigkeit: faehigkeit || null,
        austragen_bis: vonLokalInput(bis),
        erinnerung_stunden: 24,
      });
      onFertig();
    } catch (err) {
      setFehler(extractApiErrorMessage(err, t("fehler_speichern")));
    }
  }

  return (
    <form onSubmit={speichern} className="mt-2 space-y-2 rounded-cid bg-bg-secondary p-2">
      <input
        className={FELD}
        value={titel}
        required
        maxLength={120}
        placeholder={t("dienste.form.titel")}
        aria-label={t("dienste.form.titel")}
        onChange={(e) => setTitel(e.target.value)}
      />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="text-xs text-text-tertiary">
          {t("dienste.form.beginn")}
          <input
            type="datetime-local"
            className={FELD}
            value={beginn}
            required
            onChange={(e) => setBeginn(e.target.value)}
          />
        </label>
        <label className="text-xs text-text-tertiary">
          {t("dienste.form.ende")}
          <input
            type="datetime-local"
            className={FELD}
            value={ende}
            onChange={(e) => setEnde(e.target.value)}
          />
        </label>
        <label className="text-xs text-text-tertiary">
          {t("dienste.form.benoetigt")}
          <input
            type="number"
            min={1}
            max={100}
            className={FELD}
            value={benoetigt}
            onChange={(e) => setBenoetigt(Number(e.target.value))}
          />
        </label>
        <label className="text-xs text-text-tertiary">
          {t("dienste.form.austragen_bis")}
          <input
            type="datetime-local"
            className={FELD}
            value={bis}
            onChange={(e) => setBis(e.target.value)}
          />
        </label>
      </div>
      <select
        className={FELD}
        aria-label={t("dienste.form.faehigkeit")}
        value={faehigkeit}
        onChange={(e) => setFaehigkeit(e.target.value)}
      >
        <option value="">{t("dienste.form.keine_faehigkeit")}</option>
        {(katalog.data ?? []).map((f) => (
          <option key={f.id} value={f.id}>
            {f.bezeichnung}
          </option>
        ))}
      </select>
      {fehler && <p className="text-xs text-status-dangerText">{fehler}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className={KNOPF} onClick={onFertig}>
          {t("abbrechen")}
        </button>
        <button
          type="submit"
          disabled={erstellen.isPending || !titel.trim() || !beginn}
          className={`${KNOPF} bg-ca text-white disabled:opacity-50`}
        >
          {t("form.speichern")}
        </button>
      </div>
    </form>
  );
}

interface Props {
  termin?: string;
  evenement?: string;
  schreiben: boolean;
}

export default function DiensteBereich({ termin, evenement, schreiben }: Props) {
  const { t, i18n } = useTranslation("kalender");
  const dienste = useDienste({ termin, evenement });
  const aktion = useDienstAktion();
  const loeschen = useDienstLoeschen();
  const [neu, setNeu] = useState(false);
  const [offen, setOffen] = useState<string | null>(null);
  const [fehler, setFehler] = useState("");

  const liste = dienste.data ?? [];
  if (!schreiben && liste.length === 0) return null;

  const ausfuehren = (p: Promise<unknown>) =>
    p
      .then(() => setFehler(""))
      .catch((e) => setFehler(extractApiErrorMessage(e, t("fehler_aktion"))));

  return (
    <div className="mt-4" data-testid="dienste-bereich">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs font-bold text-text-tertiary">{t("dienste.titel")}</p>
        {schreiben && !neu && (
          <button type="button" className={KNOPF} onClick={() => setNeu(true)}>
            {t("dienste.hinzufuegen")}
          </button>
        )}
      </div>
      {liste.length === 0 && <p className="text-xs text-text-tertiary">{t("dienste.keine")}</p>}
      <ul className="space-y-2">
        {liste.map((d) => (
          <li key={d.id} className="rounded-cid border border-text-tertiary/20 p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-sm font-semibold text-text-primary">{d.titel}</span>{" "}
                <Besetzung dienst={d} />
                <div className="text-xs text-text-secondary">
                  {formatDienstZeit(d, i18n.language)}
                  {d.faehigkeit_name ? ` · ${d.faehigkeit_name}` : ""}
                </div>
              </div>
              <div className="flex gap-1">
                {d.ich_eingetragen ? (
                  <button
                    type="button"
                    className={KNOPF}
                    onClick={() =>
                      ausfuehren(aktion.mutateAsync({ id: d.id, aktion: "austragen" }))
                    }
                  >
                    {t("dienste.austragen")}
                  </button>
                ) : (
                  d.frei > 0 && (
                    <button
                      type="button"
                      className={`${KNOPF} bg-ca text-white`}
                      onClick={() =>
                        ausfuehren(aktion.mutateAsync({ id: d.id, aktion: "eintragen" }))
                      }
                    >
                      {t("dienste.eintragen")}
                    </button>
                  )
                )}
                {schreiben && (
                  <>
                    <button
                      type="button"
                      className={KNOPF}
                      onClick={() => setOffen(offen === d.id ? null : d.id)}
                    >
                      {t("dienste.personen")}
                    </button>
                    <button
                      type="button"
                      aria-label={t("dienste.loeschen")}
                      className={`${KNOPF} text-status-dangerText`}
                      onClick={() => ausfuehren(loeschen.mutateAsync(d.id))}
                    >
                      ✕
                    </button>
                  </>
                )}
              </div>
            </div>
            {d.ich_eingetragen && (
              <p className="mt-1 text-xs text-status-successText">
                ✓ {t("dienste.du_bist_eingetragen")}
              </p>
            )}
            {schreiben && offen === d.id && <PersonenZuweisung dienst={d} />}
          </li>
        ))}
      </ul>
      {neu && <DienstNeu termin={termin} evenement={evenement} onFertig={() => setNeu(false)} />}
      {fehler && <p className="mt-2 text-xs text-status-dangerText">{fehler}</p>}
    </div>
  );
}
