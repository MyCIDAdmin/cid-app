/**
 * Formular „Termin anlegen/bearbeiten“ bzw. „Termin vorschlagen“ (Release 15). Wer nur
 * vorschlagen darf (Seite „Terminvorschläge einreichen“), sieht kein Einladungsfeld ; das Bureau
 * gibt Vorschläge frei oder lehnt sie ab.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  usePersonenSuche,
  useTerminAendern,
  useTerminErstellen,
  useTerminVorschlagen,
} from "../../hooks/useKalender";
import { useProjets } from "../../hooks/useProjets";
import {
  KATEGORIEN,
  SICHTBARKEITEN,
  type Kategorie,
  type Kreis,
  type Person,
  type Sichtbarkeit,
  type Termin,
  type TerminPayload,
  type Wiederholung,
} from "../../types/kalender";
import { extractApiErrorMessage } from "../../utils/apiError";
import { vonLokalInput, zuLokalInput } from "../../utils/kalender";
import UebersetzungenButton from "../ui/UebersetzungenButton";

const FELD = "w-full rounded-cid border border-text-tertiary/30 bg-bg-primary px-2 py-1.5 text-sm";
const ERINNERUNGEN = [1, 2, 24, 48];

interface Props {
  termin?: Termin;
  /** Nur vorschlagen (kein Schreibrecht). */
  vorschlag: boolean;
  startTag?: Date;
  onFertig: () => void;
  onAbbrechen: () => void;
}

function standardBeginn(tag?: Date): string {
  const d = tag ? new Date(tag) : new Date();
  d.setHours(18, 0, 0, 0);
  return zuLokalInput(d.toISOString());
}

export default function TerminFormular({
  termin,
  vorschlag,
  startTag,
  onFertig,
  onAbbrechen,
}: Props) {
  const { t } = useTranslation("kalender");
  const erstellen = useTerminErstellen();
  const vorschlagen = useTerminVorschlagen();
  const aendern = useTerminAendern();
  const projekte = useProjets({});

  const [titel, setTitel] = useState(termin?.titel ?? "");
  const [beschreibung, setBeschreibung] = useState(termin?.beschreibung ?? "");
  const [ort, setOrt] = useState(termin?.ort ?? "");
  const [link, setLink] = useState(termin?.link ?? "");
  const [kategorie, setKategorie] = useState<Kategorie>(termin?.kategorie ?? "sitzung");
  const [ganztaegig, setGanztaegig] = useState(termin?.ganztaegig ?? false);
  const [beginn, setBeginn] = useState(
    termin ? zuLokalInput(termin.beginn, termin.ganztaegig) : standardBeginn(startTag),
  );
  const [ende, setEnde] = useState(termin ? zuLokalInput(termin.ende, termin.ganztaegig) : "");
  const [sichtbarkeit, setSichtbarkeit] = useState<Sichtbarkeit>(
    termin?.sichtbarkeit ?? (vorschlag ? "mitglieder" : "kreis"),
  );
  const [kreis, setKreis] = useState<Kreis>(termin?.kreis || "bureau");
  const [projekt, setProjekt] = useState(termin?.projekt ?? "");
  const [wichtig, setWichtig] = useState(termin?.wichtig ?? false);
  const [wiederholung, setWiederholung] = useState<Wiederholung>(termin?.wiederholung ?? "keine");
  const [wiederholungBis, setWiederholungBis] = useState(termin?.wiederholung_bis ?? "");
  const [erinnerung, setErinnerung] = useState<string>(
    termin?.erinnerung_stunden != null ? String(termin.erinnerung_stunden) : "",
  );
  const [eingeladen, setEingeladen] = useState<Person[]>(
    (termin?.einladungen ?? []).map((e) => ({ user: e.user, name: e.name })),
  );
  const [suche, setSuche] = useState("");
  const [fehler, setFehler] = useState("");
  const treffer = usePersonenSuche(suche);

  const laeuft = erstellen.isPending || vorschlagen.isPending || aendern.isPending;

  function umschaltenGanztaegig(wert: boolean) {
    setGanztaegig(wert);
    setBeginn((b) => (wert ? b.slice(0, 10) : `${b.slice(0, 10)}T18:00`));
    setEnde((e) => (e ? (wert ? e.slice(0, 10) : `${e.slice(0, 10)}T19:00`) : ""));
  }

  async function speichern(e: React.FormEvent) {
    e.preventDefault();
    setFehler("");
    const payload: TerminPayload = {
      titel: titel.trim(),
      beschreibung,
      ort,
      link,
      kategorie,
      beginn: vonLokalInput(beginn) ?? "",
      ende: vonLokalInput(ende),
      ganztaegig,
      sichtbarkeit,
      kreis: sichtbarkeit === "kreis" ? kreis : "",
      projekt: sichtbarkeit === "kreis" && kreis === "projekt" ? projekt || null : null,
      wichtig,
      wiederholung,
      wiederholung_bis: wiederholung === "keine" ? null : wiederholungBis || null,
      erinnerung_stunden: erinnerung ? Number(erinnerung) : null,
    };
    if (!vorschlag) payload.einladen = eingeladen.map((p) => p.user);
    try {
      if (termin) await aendern.mutateAsync({ id: termin.id, payload });
      else if (vorschlag) await vorschlagen.mutateAsync(payload);
      else await erstellen.mutateAsync(payload);
      onFertig();
    } catch (err) {
      setFehler(extractApiErrorMessage(err, t("fehler_speichern")));
    }
  }

  const inputTyp = ganztaegig ? "date" : "datetime-local";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="termin-form-titel"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <form
        onSubmit={speichern}
        className="max-h-[92vh] w-full max-w-xl space-y-3 overflow-y-auto rounded-cid-lg bg-bg-primary p-5 shadow-xl"
      >
        <h2 id="termin-form-titel" className="text-base font-semibold text-text-primary">
          {termin ? t("form.bearbeiten") : vorschlag ? t("form.vorschlagen") : t("form.neu")}
        </h2>
        {vorschlag && !termin && (
          <p className="text-xs text-text-secondary">{t("form.vorschlag_hinweis")}</p>
        )}
        <label className="block text-xs font-bold text-text-tertiary">
          {t("form.titel")}
          <input
            className={FELD}
            value={titel}
            maxLength={200}
            required
            onChange={(e) => setTitel(e.target.value)}
          />
        </label>
        {termin && (
          <UebersetzungenButton
            modell="kalender.termin"
            objektId={termin.id}
            className="text-xs text-ca underline"
          />
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-xs font-bold text-text-tertiary">
            {t("form.kategorie")}
            <select
              className={FELD}
              value={kategorie}
              onChange={(e) => setKategorie(e.target.value as Kategorie)}
            >
              {KATEGORIEN.map((k) => (
                <option key={k} value={k}>
                  {t(`kategorie.${k}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-end gap-2 pb-1.5 text-sm text-text-primary">
            <input
              type="checkbox"
              checked={ganztaegig}
              onChange={(e) => umschaltenGanztaegig(e.target.checked)}
            />
            {t("form.ganztaegig")}
          </label>
          <label className="block text-xs font-bold text-text-tertiary">
            {t("form.beginn")}
            <input
              type={inputTyp}
              className={FELD}
              value={beginn}
              required
              onChange={(e) => setBeginn(e.target.value)}
            />
          </label>
          <label className="block text-xs font-bold text-text-tertiary">
            {t("form.ende")}
            <input
              type={inputTyp}
              className={FELD}
              value={ende}
              onChange={(e) => setEnde(e.target.value)}
            />
          </label>
        </div>
        <label className="block text-xs font-bold text-text-tertiary">
          {t("form.ort")}
          <input className={FELD} value={ort} onChange={(e) => setOrt(e.target.value)} />
        </label>
        <label className="block text-xs font-bold text-text-tertiary">
          {t("form.link")}
          <input
            type="url"
            className={FELD}
            value={link}
            placeholder="https://"
            onChange={(e) => setLink(e.target.value)}
          />
        </label>
        <label className="block text-xs font-bold text-text-tertiary">
          {t("form.beschreibung")}
          <textarea
            className={FELD}
            rows={3}
            value={beschreibung}
            onChange={(e) => setBeschreibung(e.target.value)}
          />
        </label>

        <fieldset className="space-y-2 rounded-cid border border-text-tertiary/20 p-3">
          <legend className="px-1 text-xs font-bold text-text-tertiary">
            {t("form.sichtbarkeit")}
          </legend>
          <select
            aria-label={t("form.sichtbarkeit")}
            className={FELD}
            value={sichtbarkeit}
            onChange={(e) => setSichtbarkeit(e.target.value as Sichtbarkeit)}
          >
            {SICHTBARKEITEN.map((s) => (
              <option key={s} value={s}>
                {t(`sichtbarkeit.${s}`)}
              </option>
            ))}
          </select>
          {sichtbarkeit === "kreis" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <select
                aria-label={t("form.kreis")}
                className={FELD}
                value={kreis}
                onChange={(e) => setKreis(e.target.value as Kreis)}
              >
                <option value="bureau">{t("kreis.bureau")}</option>
                <option value="projekt">{t("kreis.projekt")}</option>
              </select>
              {kreis === "projekt" && (
                <select
                  aria-label={t("form.projekt")}
                  className={FELD}
                  value={projekt}
                  required
                  onChange={(e) => setProjekt(e.target.value)}
                >
                  <option value="">{t("form.projekt_waehlen")}</option>
                  {(projekte.data?.results ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.titre}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </fieldset>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block text-xs font-bold text-text-tertiary">
            {t("form.wiederholung")}
            <select
              className={FELD}
              value={wiederholung}
              onChange={(e) => setWiederholung(e.target.value as Wiederholung)}
            >
              {(["keine", "woechentlich", "zweiwoechentlich", "monatlich"] as const).map((w) => (
                <option key={w} value={w}>
                  {t(`wiederholung.${w}`)}
                </option>
              ))}
            </select>
          </label>
          {wiederholung !== "keine" && (
            <label className="block text-xs font-bold text-text-tertiary">
              {t("form.wiederholung_bis")}
              <input
                type="date"
                className={FELD}
                value={wiederholungBis}
                onChange={(e) => setWiederholungBis(e.target.value)}
              />
            </label>
          )}
          {!vorschlag && (
            <label className="block text-xs font-bold text-text-tertiary">
              {t("form.erinnerung")}
              <select
                className={FELD}
                value={erinnerung}
                onChange={(e) => setErinnerung(e.target.value)}
              >
                <option value="">{t("form.keine_erinnerung")}</option>
                {ERINNERUNGEN.map((h) => (
                  <option key={h} value={h}>
                    {t("form.stunden_vorher", { count: h })}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-text-primary">
          <input type="checkbox" checked={wichtig} onChange={(e) => setWichtig(e.target.checked)} />
          {t("form.wichtig")}
        </label>

        {!vorschlag && (
          <div>
            <p className="mb-1 text-xs font-bold text-text-tertiary">{t("form.einladen")}</p>
            {eingeladen.length > 0 && (
              <ul className="mb-2 flex flex-wrap gap-1">
                {eingeladen.map((p) => (
                  <li key={p.user}>
                    <button
                      type="button"
                      aria-label={t("form.entfernen", { name: p.name })}
                      onClick={() => setEingeladen((l) => l.filter((x) => x.user !== p.user))}
                      className="rounded-full bg-bg-tertiary px-2 py-0.5 text-xs text-text-primary"
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
              placeholder={t("form.person_suchen")}
              onChange={(e) => setSuche(e.target.value)}
            />
            {suche.trim().length >= 2 && (treffer.data ?? []).length > 0 && (
              <ul className="mt-1 rounded-cid border border-text-tertiary/20">
                {(treffer.data ?? [])
                  .filter((p) => !eingeladen.some((x) => x.user === p.user))
                  .map((p) => (
                    <li key={p.user}>
                      <button
                        type="button"
                        className="block w-full px-2 py-1 text-start text-sm hover:bg-bg-secondary"
                        onClick={() => {
                          setEingeladen((l) => [...l, p]);
                          setSuche("");
                        }}
                      >
                        {p.name}
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}

        {fehler && <p className="text-xs text-status-dangerText">{fehler}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onAbbrechen}
            className="rounded-cid px-3 py-1.5 text-sm text-text-secondary"
          >
            {t("abbrechen")}
          </button>
          <button
            type="submit"
            disabled={laeuft || !titel.trim()}
            className="rounded-cid bg-ca px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {vorschlag && !termin ? t("form.vorschlag_senden") : t("form.speichern")}
          </button>
        </div>
      </form>
    </div>
  );
}
