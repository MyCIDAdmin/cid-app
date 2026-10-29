/** Reiter „Meine Reise“ : eigene Etappen, Unterkunft, Freigaben und Haken. Standard ist privat. */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useAbsagen,
  useAnkunftZustimmung,
  useEtappeAnlegen,
  useEtappeLoeschen,
  useGemeinsameAnkunft,
  useMeineAendern,
  useUnterkuenfte,
} from "../../hooks/useReisen";
import { extractApiErrorMessage } from "../../utils/apiError";
import { lokalZuIso, zeitKurz } from "../../utils/reisen";
import type { Etappe, Freigabe, ReiseDetail } from "../../types/reisen";
import { FELD, Fehler, KARTE, KNOPF, KNOPF_LEISE } from "./ui";

const ARTEN = ["flug", "zug", "bus", "auto", "sonstiges"] as const;
const STATI = ["offen", "geplant", "gebucht", "selbst"] as const;
const LEER = {
  richtung: "hin",
  art: "flug",
  von_ort: "",
  von_code: "",
  nach_ort: "",
  nach_code: "",
  abfahrt: "",
  ankunft: "",
  anbieter: "",
  status: "geplant",
  referenz: "",
};

function EtappeForm({ reiseId, onFertig }: { reiseId: string; onFertig: () => void }) {
  const { t } = useTranslation("reisen");
  const anlegen = useEtappeAnlegen(reiseId);
  const [f, setF] = useState({ ...LEER });
  const [fehler, setFehler] = useState("");
  const set = (k: keyof typeof LEER, v: string) => setF({ ...f, [k]: v });

  function senden(ev: React.FormEvent) {
    ev.preventDefault();
    if (!f.von_ort.trim() || !f.nach_ort.trim()) return;
    anlegen.mutate(
      {
        ...f,
        richtung: f.richtung as Etappe["richtung"],
        art: f.art as Etappe["art"],
        status: f.status as Etappe["status"],
        abfahrt: lokalZuIso(f.abfahrt),
        ankunft: lokalZuIso(f.ankunft),
      },
      {
        onSuccess: onFertig,
        onError: (e) => setFehler(extractApiErrorMessage(e, t("fehler.allgemein"))),
      },
    );
  }

  return (
    <form
      onSubmit={senden}
      className={`${KARTE} grid grid-cols-2 gap-2 sm:grid-cols-4`}
      aria-label={t("meine.etappe_neu")}
    >
      <select
        className={FELD}
        aria-label={t("meine.richtung")}
        value={f.richtung}
        onChange={(e) => set("richtung", e.target.value)}
      >
        {(["hin", "rueck", "zwischen"] as const).map((r) => (
          <option key={r} value={r}>
            {t(`richtung.${r}`)}
          </option>
        ))}
      </select>
      <select
        className={FELD}
        aria-label={t("meine.art")}
        value={f.art}
        onChange={(e) => set("art", e.target.value)}
      >
        {ARTEN.map((a) => (
          <option key={a} value={a}>
            {t(`art.${a}`)}
          </option>
        ))}
      </select>
      <input
        className={FELD}
        aria-label={t("meine.von")}
        placeholder={t("meine.von")}
        value={f.von_ort}
        onChange={(e) => set("von_ort", e.target.value)}
        required
      />
      <input
        className={FELD}
        aria-label={t("meine.von_code")}
        placeholder={t("meine.code")}
        value={f.von_code}
        onChange={(e) => set("von_code", e.target.value)}
      />
      <input
        className={FELD}
        aria-label={t("meine.nach")}
        placeholder={t("meine.nach")}
        value={f.nach_ort}
        onChange={(e) => set("nach_ort", e.target.value)}
        required
      />
      <input
        className={FELD}
        aria-label={t("meine.nach_code")}
        placeholder={t("meine.code")}
        value={f.nach_code}
        onChange={(e) => set("nach_code", e.target.value)}
      />
      <label className="text-[11px] text-text-tertiary">
        {t("meine.abfahrt")}
        <input
          type="datetime-local"
          className={FELD}
          value={f.abfahrt}
          onChange={(e) => set("abfahrt", e.target.value)}
        />
      </label>
      <label className="text-[11px] text-text-tertiary">
        {t("meine.ankunft")}
        <input
          type="datetime-local"
          className={FELD}
          value={f.ankunft}
          onChange={(e) => set("ankunft", e.target.value)}
        />
      </label>
      <input
        className={FELD}
        aria-label={t("meine.anbieter")}
        placeholder={t("meine.anbieter")}
        value={f.anbieter}
        onChange={(e) => set("anbieter", e.target.value)}
      />
      <select
        className={FELD}
        aria-label={t("meine.status")}
        value={f.status}
        onChange={(e) => set("status", e.target.value)}
      >
        {STATI.map((s) => (
          <option key={s} value={s}>
            {t(`etappe_status.${s}`)}
          </option>
        ))}
      </select>
      <input
        className={`${FELD} col-span-2`}
        aria-label={t("meine.referenz")}
        placeholder={t("meine.referenz")}
        value={f.referenz}
        onChange={(e) => set("referenz", e.target.value)}
      />
      <div className="col-span-2 flex items-center gap-2 sm:col-span-4">
        <button type="submit" className={KNOPF} disabled={anlegen.isPending}>
          {t("meine.etappe_speichern")}
        </button>
        <button type="button" className={KNOPF_LEISE} onClick={onFertig}>
          {t("abbrechen")}
        </button>
        <Fehler text={fehler} />
      </div>
    </form>
  );
}

function GemeinsameAnreise({ reise, offen }: { reise: ReiseDetail; offen: boolean }) {
  const { t } = useTranslation("reisen");
  const ankunft = useGemeinsameAnkunft(reise.id, offen);
  const zustimmen = useAnkunftZustimmung(reise.id);
  const gruppen = offen ? (ankunft.data?.gruppen ?? []) : [];
  return (
    <div className="space-y-2">
      {offen && (
        <>
          <p className="text-xs text-text-secondary">{t("ankunft.hinweis")}</p>
          {gruppen.length === 0 && (
            <p className="text-xs text-text-tertiary">{t("ankunft.keine")}</p>
          )}
          <ul className="space-y-1.5">
            {gruppen.map((g) => (
              <li
                key={`${g.typ}-${g.ort}-${g.tag}`}
                className="rounded-cid bg-bg-tertiary p-2 text-xs"
              >
                <p>
                  <b>{t(`ankunft.${g.typ}`)}</b> · {g.ort} · {g.tag} · {g.von}–{g.bis} ·{" "}
                  {t("ankunft.weitere", { count: g.weitere })}
                </p>
                <label className="mt-1 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={g.ich_zugestimmt}
                    onChange={(e) =>
                      zustimmen.mutate({
                        gruppe: { typ: g.typ, ort: g.ort, tag: g.tag },
                        zustimmen: e.target.checked,
                      })
                    }
                  />
                  {t("ankunft.kontakt")}
                </label>
                {g.kontakte.length > 0 && (
                  <p className="mt-1 text-text-secondary">
                    {t("ankunft.kontakte")}: {g.kontakte.join(", ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default function MeineReiseTab({ reise }: { reise: ReiseDetail }) {
  const { t, i18n } = useTranslation("reisen");
  const meine = reise.meine;
  const aendern = useMeineAendern(reise.id);
  const loeschen = useEtappeLoeschen(reise.id);
  const absagen = useAbsagen(reise.id);
  const unterkuenfte = useUnterkuenfte(reise.id, reise.voll);
  const [neu, setNeu] = useState(false);
  const [fehler, setFehler] = useState("");
  const speichern = (daten: Parameters<typeof aendern.mutate>[0]) =>
    aendern.mutate(daten, {
      onError: (e) => setFehler(extractApiErrorMessage(e, t("fehler.allgemein"))),
    });

  if (!meine) return <p className="text-sm text-text-secondary">{t("meine.nicht_beteiligt")}</p>;
  const freigaben: {
    feld: "freigabe_hin" | "freigabe_rueck" | "freigabe_unterkunft";
    label: string;
  }[] = [
    { feld: "freigabe_hin", label: t("meine.freigabe_hin") },
    { feld: "freigabe_rueck", label: t("meine.freigabe_rueck") },
    { feld: "freigabe_unterkunft", label: t("meine.freigabe_unterkunft") },
  ];

  return (
    <div className="space-y-4">
      <p className="rounded-cid bg-bg-tertiary p-2 text-xs text-text-secondary">
        {t("meine.privat_hinweis")}
      </p>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{t("meine.etappen")}</h2>
          {meine.status === "dabei" && !neu && (
            <button type="button" className={KNOPF} onClick={() => setNeu(true)}>
              {t("meine.etappe_neu")}
            </button>
          )}
        </div>
        {neu && <EtappeForm reiseId={reise.id} onFertig={() => setNeu(false)} />}
        {meine.etappen.length === 0 && !neu && (
          <p className="text-xs text-text-tertiary">{t("meine.keine_etappen")}</p>
        )}
        <ul className="space-y-1.5">
          {meine.etappen.map((e) => (
            <li
              key={e.id}
              className={`${KARTE} flex flex-wrap items-center justify-between gap-2 text-sm`}
            >
              <span>
                <b>{t(`richtung.${e.richtung}`)}</b> · {t(`art.${e.art}`)} · {e.von_ort}
                {e.von_code && ` (${e.von_code})`} → {e.nach_ort}
                {e.nach_code && ` (${e.nach_code})`}
                <span className="block text-xs text-text-secondary">
                  {zeitKurz(e.abfahrt, i18n.language)}
                  {e.ankunft ? ` – ${zeitKurz(e.ankunft, i18n.language)}` : ""} ·{" "}
                  {t(`etappe_status.${e.status}`)}
                  {e.anbieter ? ` · ${e.anbieter}` : ""}
                  {e.referenz ? ` · ${e.referenz}` : ""}
                </span>
              </span>
              <button
                type="button"
                className="text-xs text-red-600"
                onClick={() => loeschen.mutate(e.id)}
              >
                {t("loeschen")}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className={`${KARTE} space-y-2`}>
        <h2 className="text-sm font-semibold">{t("meine.unterkunft")}</h2>
        <select
          className={FELD}
          aria-label={t("meine.unterkunft")}
          value={meine.unterkunft ?? (meine.unterkunft_eigen ? "eigen" : "")}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "eigen")
              speichern({ unterkunft: null, unterkunft_eigen: meine.unterkunft_eigen || "—" });
            else speichern({ unterkunft: v || null, unterkunft_eigen: "" });
          }}
        >
          <option value="">{t("meine.keine_angabe")}</option>
          {(unterkuenfte.data ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
          <option value="eigen">{t("meine.eigene_unterkunft")}</option>
        </select>
        {!meine.unterkunft && meine.unterkunft_eigen && (
          <input
            className={FELD}
            aria-label={t("meine.eigene_unterkunft")}
            defaultValue={meine.unterkunft_eigen === "—" ? "" : meine.unterkunft_eigen}
            onBlur={(e) => speichern({ unterkunft_eigen: e.target.value || "—" })}
          />
        )}
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={meine.unterkunft_gebucht}
            onChange={(e) => speichern({ unterkunft_gebucht: e.target.checked })}
          />
          {t("meine.unterkunft_gebucht")}
        </label>
      </section>

      <section className={`${KARTE} space-y-2`}>
        <h2 className="text-sm font-semibold">{t("meine.freigaben")}</h2>
        {freigaben.map(({ feld, label }) => (
          <label key={feld} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            {label}
            <select
              className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs"
              value={meine[feld]}
              onChange={(e) => speichern({ [feld]: e.target.value as Freigabe })}
            >
              <option value="privat">{t("freigabe.privat")}</option>
              <option value="teilgruppe">{t("freigabe.teilgruppe")}</option>
              <option value="alle">{t("freigabe.alle")}</option>
            </select>
          </label>
        ))}
        <label className="flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            checked={meine.verbergen_vor_orga}
            onChange={(e) => speichern({ verbergen_vor_orga: e.target.checked })}
          />
          <span>{t("meine.verbergen_vor_orga")}</span>
        </label>
      </section>

      <section className={`${KARTE} space-y-2`}>
        <h2 className="text-sm font-semibold">{t("ankunft.titel")}</h2>
        <label className="flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            checked={meine.offen_gemeinsame_anreise}
            onChange={(e) => speichern({ offen_gemeinsame_anreise: e.target.checked })}
          />
          <span>{t("ankunft.offen")}</span>
        </label>
        <GemeinsameAnreise reise={reise} offen={meine.offen_gemeinsame_anreise} />
      </section>

      <section className={`${KARTE} space-y-2`}>
        <h2 className="text-sm font-semibold">{t("meine.sonstiges")}</h2>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={meine.stadionkarte}
            onChange={(e) => speichern({ stadionkarte: e.target.checked })}
          />
          {t("haken.stadionkarte")}
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={meine.dokument_gueltig}
            onChange={(e) => speichern({ dokument_gueltig: e.target.checked })}
          />
          {t("haken.dokument")}
        </label>
        <label className="flex items-center gap-2 text-xs">
          {t("meine.begleitpersonen")}
          <input
            type="number"
            min={0}
            max={20}
            className="w-16 rounded-cid border border-text-tertiary/30 px-2 py-1"
            defaultValue={meine.begleitpersonen}
            onBlur={(e) => speichern({ begleitpersonen: Number(e.target.value) || 0 })}
          />
        </label>
        <input
          className={FELD}
          aria-label={t("meine.notiz")}
          placeholder={t("meine.notiz")}
          defaultValue={meine.notiz}
          maxLength={500}
          onBlur={(e) => speichern({ notiz: e.target.value })}
        />
        <label className="flex items-center gap-2 text-xs">
          {t("meine.geburtsdatum")}
          <input
            type="date"
            className="rounded-cid border border-text-tertiary/30 px-2 py-1"
            defaultValue={meine.geburtsdatum ?? ""}
            onBlur={(e) => speichern({ geburtsdatum: e.target.value || null })}
          />
        </label>
        <p className="text-[11px] text-text-tertiary">{t("meine.geburtsdatum_hinweis")}</p>
        <Fehler text={fehler} />
      </section>

      {meine.rolle !== "organisator" && meine.status !== "abgesagt" && (
        <button
          type="button"
          className="text-xs text-red-600 underline"
          onClick={() => absagen.mutate()}
        >
          {t("meine.absagen")}
        </button>
      )}
    </div>
  );
}
