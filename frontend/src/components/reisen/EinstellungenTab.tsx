/** Reiter „Einstellungen“ (Organisation) : Reise bearbeiten, feste Infos, Unterkünfte, Einladen, Teilen. */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { teilenUrlDerReise } from "../../api/reisen";
import RichTextEditor from "../ui/RichTextEditor";
import ShareButton from "../ui/ShareButton";
import {
  useEinladen,
  useMitgliederSuche,
  useReiseAendern,
  useReiseLoeschen,
  useUnterkunftAnlegen,
  useUnterkunftLoeschen,
  useUnterkuenfte,
} from "../../hooks/useReisen";
import { extractApiErrorMessage } from "../../utils/apiError";
import type { Baustein, Beitritt, Phase, ReiseDetail, Sichtbarkeit } from "../../types/reisen";
import { FELD, Fehler, KARTE, KNOPF, KNOPF_LEISE } from "./ui";

const PHASEN: Phase[] = ["interesse", "planung", "buchung", "reise", "rueckblick"];
const BAUSTEINE: Baustein[] = [
  "unterkunft",
  "flug",
  "transport",
  "tickets",
  "programm",
  "sonstiges",
];

function Einladen({ reise }: { reise: ReiseDetail }) {
  const { t } = useTranslation("reisen");
  const einladen = useEinladen(reise.id);
  const [q, setQ] = useState("");
  const [gewaehlt, setGewaehlt] = useState<{ id: string; name: string }[]>([]);
  const [meldung, setMeldung] = useState("");
  const treffer = useMitgliederSuche(q);
  const link = `${window.location.origin}/reisen/einladung/${reise.einladungs_token ?? ""}`;

  return (
    <section className={`${KARTE} space-y-2`} aria-label={t("einladen.titel")}>
      <h2 className="text-sm font-semibold">{t("einladen.titel")}</h2>
      <input
        className={FELD}
        aria-label={t("einladen.suche")}
        placeholder={t("einladen.suche")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <ul className="flex flex-wrap gap-1">
        {(treffer.data ?? [])
          .filter((m) => !gewaehlt.some((g) => g.id === m.id))
          .map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className={KNOPF_LEISE}
                onClick={() => setGewaehlt([...gewaehlt, m])}
              >
                + {m.name}
              </button>
            </li>
          ))}
      </ul>
      {gewaehlt.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {gewaehlt.map((g) => (
            <button
              key={g.id}
              type="button"
              className="rounded-full bg-ca/10 px-2 py-0.5 text-xs text-ca"
              onClick={() => setGewaehlt(gewaehlt.filter((x) => x.id !== g.id))}
            >
              {g.name} ×
            </button>
          ))}
          <button
            type="button"
            className={KNOPF}
            onClick={() =>
              einladen.mutate(
                gewaehlt.map((g) => g.id),
                {
                  onSuccess: (r) => {
                    setMeldung(t("einladen.gesendet", { n: r.eingeladen }));
                    setGewaehlt([]);
                    setQ("");
                  },
                },
              )
            }
          >
            {t("einladen.senden")}
          </button>
        </div>
      )}
      {meldung && <p className="text-xs text-green-700">{meldung}</p>}
      <div className="flex flex-wrap items-center gap-2 border-t border-text-tertiary/15 pt-2">
        <input
          readOnly
          className={`${FELD} flex-1`}
          aria-label={t("einladen.link")}
          value={link}
          onFocus={(e) => e.target.select()}
        />
        <button
          type="button"
          className={KNOPF_LEISE}
          onClick={() => void navigator.clipboard?.writeText(link)}
        >
          {t("einladen.kopieren")}
        </button>
      </div>
      {reise.vorschau_oeffentlich && reise.sichtbarkeit !== "eingeladen" && (
        <ShareButton
          path={`/reise/${reise.id}`}
          url={teilenUrlDerReise(reise.id)}
          titre={reise.titel}
        />
      )}
    </section>
  );
}

function Unterkuenfte({ reiseId }: { reiseId: string }) {
  const { t } = useTranslation("reisen");
  const q = useUnterkuenfte(reiseId);
  const anlegen = useUnterkunftAnlegen(reiseId);
  const loeschen = useUnterkunftLoeschen(reiseId);
  const [name, setName] = useState("");
  const [entfernung, setEntfernung] = useState("");
  return (
    <section className={`${KARTE} space-y-2`} aria-label={t("unterkuenfte.titel")}>
      <h2 className="text-sm font-semibold">{t("unterkuenfte.titel")}</h2>
      <ul className="space-y-1 text-sm">
        {(q.data ?? []).map((u) => (
          <li key={u.id} className="flex items-center justify-between">
            <span>
              {u.name}
              {u.entfernung ? ` · ${u.entfernung}` : ""} ·{" "}
              {t("unterkuenfte.belegt", { n: u.belegt })}
            </span>
            <button
              type="button"
              className="text-xs text-red-600"
              onClick={() => loeschen.mutate(u.id)}
            >
              {t("loeschen")}
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          anlegen.mutate(
            { name, entfernung },
            {
              onSuccess: () => {
                setName("");
                setEntfernung("");
              },
            },
          );
        }}
      >
        <input
          className={`${FELD} flex-1`}
          aria-label={t("unterkuenfte.name")}
          placeholder={t("unterkuenfte.name")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className={`${FELD} flex-1`}
          aria-label={t("unterkuenfte.entfernung")}
          placeholder={t("unterkuenfte.entfernung")}
          value={entfernung}
          onChange={(e) => setEntfernung(e.target.value)}
        />
        <button type="submit" className={KNOPF}>
          {t("unterkuenfte.hinzufuegen")}
        </button>
      </form>
    </section>
  );
}

export default function EinstellungenTab({ reise }: { reise: ReiseDetail }) {
  const { t } = useTranslation("reisen");
  const navigate = useNavigate();
  const aendern = useReiseAendern(reise.id);
  const loeschen = useReiseLoeschen(reise.id);
  const [f, setF] = useState({
    titel: reise.titel,
    ziel_ort: reise.ziel_ort,
    land: reise.land,
    stadion: reise.stadion,
    start: reise.start ?? "",
    ende: reise.ende ?? "",
    sichtbarkeit: reise.sichtbarkeit,
    beitritt: reise.beitritt,
    phase: reise.phase,
    min: reise.min_teilnehmer?.toString() ?? "",
    max: reise.max_teilnehmer?.toString() ?? "",
    anmelde_frist: reise.anmelde_frist ?? "",
    vorschau: reise.vorschau_oeffentlich,
    vorschlaege: reise.vorschlaege_erlaubt,
    beschreibung: reise.beschreibung,
    stadion_infos: reise.stadion_infos ?? "",
    laenderinfo: reise.laenderinfo ?? "",
    regeln: reise.regeln ?? "",
    budget: { ...reise.budget_grenzen } as Record<string, string>,
  });
  const [fehler, setFehler] = useState("");
  const [gespeichert, setGespeichert] = useState(false);
  const [bestaetigeLoeschen, setBestaetigeLoeschen] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v });

  function speichern(ev: React.FormEvent) {
    ev.preventDefault();
    setGespeichert(false);
    aendern.mutate(
      {
        titel: f.titel,
        ziel_ort: f.ziel_ort,
        land: f.land,
        stadion: f.stadion,
        start: f.start || null,
        ende: f.ende || null,
        sichtbarkeit: f.sichtbarkeit,
        beitritt: f.beitritt,
        phase: f.phase,
        min_teilnehmer: f.min ? Number(f.min) : null,
        max_teilnehmer: f.max ? Number(f.max) : null,
        anmelde_frist: f.anmelde_frist || null,
        vorschau_oeffentlich: f.vorschau,
        vorschlaege_erlaubt: f.vorschlaege,
        beschreibung: f.beschreibung,
        stadion_infos: f.stadion_infos,
        laenderinfo: f.laenderinfo,
        regeln: f.regeln,
        budget_grenzen: Object.fromEntries(Object.entries(f.budget).filter(([, v]) => v !== "")),
      },
      {
        onSuccess: () => {
          setFehler("");
          setGespeichert(true);
        },
        onError: (e) => setFehler(extractApiErrorMessage(e, t("fehler.allgemein"))),
      },
    );
  }

  return (
    <div className="space-y-4">
      <Einladen reise={reise} />
      <Unterkuenfte reiseId={reise.id} />
      <form
        onSubmit={speichern}
        className={`${KARTE} space-y-3`}
        aria-label={t("einstellungen.titel")}
      >
        <h2 className="text-sm font-semibold">{t("einstellungen.titel")}</h2>
        <input
          className={FELD}
          aria-label={t("neu.titel")}
          value={f.titel}
          onChange={(e) => set("titel", e.target.value)}
          required
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input
            className={FELD}
            aria-label={t("neu.ziel_ort")}
            placeholder={t("neu.ziel_ort")}
            value={f.ziel_ort}
            onChange={(e) => set("ziel_ort", e.target.value)}
          />
          <input
            className={FELD}
            aria-label={t("neu.land")}
            placeholder={t("neu.land")}
            value={f.land}
            onChange={(e) => set("land", e.target.value)}
          />
          <input
            className={FELD}
            aria-label={t("neu.stadion")}
            placeholder={t("neu.stadion")}
            value={f.stadion}
            onChange={(e) => set("stadion", e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className="text-[11px] text-text-tertiary">
            {t("neu.start")}
            <input
              type="date"
              className={FELD}
              value={f.start}
              onChange={(e) => set("start", e.target.value)}
            />
          </label>
          <label className="text-[11px] text-text-tertiary">
            {t("neu.ende")}
            <input
              type="date"
              className={FELD}
              value={f.ende}
              onChange={(e) => set("ende", e.target.value)}
            />
          </label>
          <label className="text-[11px] text-text-tertiary">
            {t("neu.anmelde_frist")}
            <input
              type="date"
              className={FELD}
              value={f.anmelde_frist}
              onChange={(e) => set("anmelde_frist", e.target.value)}
            />
          </label>
          <label className="text-[11px] text-text-tertiary">
            {t("einstellungen.phase")}
            <select
              className={FELD}
              value={f.phase}
              onChange={(e) => set("phase", e.target.value as Phase)}
            >
              {PHASEN.map((p) => (
                <option key={p} value={p}>
                  {t(`phase.${p}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className="text-[11px] text-text-tertiary">
            {t("neu.sichtbarkeit")}
            <select
              className={FELD}
              value={f.sichtbarkeit}
              onChange={(e) => set("sichtbarkeit", e.target.value as Sichtbarkeit)}
            >
              {(["eingeladen", "mitglieder", "konto"] as const).map((x) => (
                <option key={x} value={x}>
                  {t(`sichtbarkeit.${x}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] text-text-tertiary">
            {t("neu.beitritt")}
            <select
              className={FELD}
              value={f.beitritt}
              onChange={(e) => set("beitritt", e.target.value as Beitritt)}
            >
              {(["offen", "genehmigung", "einladung"] as const).map((x) => (
                <option key={x} value={x}>
                  {t(`beitritt_modus.${x}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] text-text-tertiary">
            {t("neu.min")}
            <input
              type="number"
              min={1}
              className={FELD}
              value={f.min}
              onChange={(e) => set("min", e.target.value)}
            />
          </label>
          <label className="text-[11px] text-text-tertiary">
            {t("neu.max")}
            <input
              type="number"
              min={1}
              className={FELD}
              value={f.max}
              onChange={(e) => set("max", e.target.value)}
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={f.vorschau}
            onChange={(e) => set("vorschau", e.target.checked)}
          />
          {t("einstellungen.vorschau")}
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={f.vorschlaege}
            onChange={(e) => set("vorschlaege", e.target.checked)}
          />
          {t("einstellungen.vorschlaege")}
        </label>

        <fieldset className="space-y-1">
          <legend className="text-xs font-semibold">{t("einstellungen.budget")}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {BAUSTEINE.map((b) => (
              <label key={b} className="text-[11px] text-text-tertiary">
                {t(`baustein.${b}`)}
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className={FELD}
                  value={f.budget[b] ?? ""}
                  onChange={(e) => set("budget", { ...f.budget, [b]: e.target.value })}
                />
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <span className="text-xs font-semibold">{t("einstellungen.beschreibung")}</span>
          <RichTextEditor
            value={f.beschreibung}
            onChange={(v) => set("beschreibung", v)}
            ariaLabel={t("einstellungen.beschreibung")}
          />
        </div>
        <div>
          <span className="text-xs font-semibold">{t("stadion_infos")}</span>
          <RichTextEditor
            value={f.stadion_infos}
            onChange={(v) => set("stadion_infos", v)}
            ariaLabel={t("stadion_infos")}
          />
        </div>
        <div>
          <span className="text-xs font-semibold">{t("laenderinfo")}</span>
          <RichTextEditor
            value={f.laenderinfo}
            onChange={(v) => set("laenderinfo", v)}
            ariaLabel={t("laenderinfo")}
          />
        </div>
        <div>
          <span className="text-xs font-semibold">{t("regeln.titel")}</span>
          <RichTextEditor
            value={f.regeln}
            onChange={(v) => set("regeln", v)}
            ariaLabel={t("regeln.titel")}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className={KNOPF} disabled={aendern.isPending}>
            {t("einstellungen.speichern")}
          </button>
          {gespeichert && (
            <span className="text-xs text-green-700">{t("einstellungen.gespeichert")}</span>
          )}
          <Fehler text={fehler} />
        </div>
      </form>

      <section className={`${KARTE} space-y-2`}>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={reise.abgesagt}
            onChange={(e) => aendern.mutate({ abgesagt: e.target.checked })}
          />
          {t("einstellungen.absagen")}
        </label>
        {reise.ist_organisator &&
          (bestaetigeLoeschen ? (
            <div className="flex items-center gap-2 text-sm">
              <span>{t("einstellungen.loeschen_frage")}</span>
              <button
                type="button"
                className="rounded-cid bg-red-600 px-3 py-1.5 text-xs text-white"
                onClick={() => loeschen.mutate(undefined, { onSuccess: () => navigate("/reisen") })}
              >
                {t("loeschen")}
              </button>
              <button
                type="button"
                className={KNOPF_LEISE}
                onClick={() => setBestaetigeLoeschen(false)}
              >
                {t("abbrechen")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="text-xs text-red-600 underline"
              onClick={() => setBestaetigeLoeschen(true)}
            >
              {t("einstellungen.loeschen")}
            </button>
          ))}
      </section>
    </div>
  );
}
