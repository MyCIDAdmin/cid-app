/** Assistent „Neue Reise“ in 3 Schritten : Ziel und Datum, Zugang, Vorlage. Danach geht es in den Raum. */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { FELD, Fehler, KARTE, KNOPF, KNOPF_LEISE } from "../../components/reisen/ui";
import { useReiseAnlegen, useStadionVorschlag } from "../../hooks/useReisen";
import { extractApiErrorMessage } from "../../utils/apiError";
import type { Beitritt, Sichtbarkeit } from "../../types/reisen";

const VORLAGEN = ["auswaerts_ausland", "wochenende", "leer"] as const;

export default function ReiseNeuPage() {
  const { t } = useTranslation("reisen");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const rencontre = params.get("rencontre") ?? undefined;
  const vorschlag = useStadionVorschlag(rencontre);
  const anlegen = useReiseAnlegen();
  const [schritt, setSchritt] = useState(1);
  const [f, setF] = useState({
    titel: "",
    ziel_ort: "",
    land: "",
    stadion: "",
    start: "",
    ende: "",
    datum_offen: false,
    sichtbarkeit: "eingeladen" as Sichtbarkeit,
    beitritt: "genehmigung" as Beitritt,
    min: "",
    max: "",
    vorlage: rencontre ? "auswaerts_ausland" : "leer",
  });
  const [fehler, setFehler] = useState("");
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) =>
    setF((alt) => ({ ...alt, [k]: v }));
  const v = vorschlag.data;
  const wert = (eigener: string, vorschlagWert?: string) => eigener || vorschlagWert || "";
  const kannWeiter = schritt !== 1 || Boolean(f.titel.trim() || rencontre);

  function erstellen() {
    anlegen.mutate(
      {
        titel: f.titel || undefined,
        ziel_ort: wert(f.ziel_ort, v?.stadt) || undefined,
        land: wert(f.land, v?.land) || undefined,
        stadion: wert(f.stadion, v?.stadion) || undefined,
        start: f.datum_offen ? null : f.start || undefined,
        ende: f.datum_offen ? null : f.ende || f.start || undefined,
        sichtbarkeit: f.sichtbarkeit,
        beitritt: f.beitritt,
        min_teilnehmer: f.min ? Number(f.min) : null,
        max_teilnehmer: f.max ? Number(f.max) : null,
        rencontre,
        vorlage: f.vorlage === "leer" ? undefined : f.vorlage,
      },
      {
        onSuccess: (r) => navigate(`/reisen/${r.id}?tab=einstellungen`),
        onError: (e) => setFehler(extractApiErrorMessage(e, t("fehler.allgemein"))),
      },
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <Link to="/reisen" className="text-xs text-ca underline">
        ← {t("titel")}
      </Link>
      <h1 className="text-xl font-bold">{t("neu.titel_seite")}</h1>
      <ol className="flex gap-1 text-[11px]" aria-label={t("neu.schritte")}>
        {[1, 2, 3].map((n) => (
          <li
            key={n}
            className={`flex-1 rounded-cid px-2 py-1 text-center ${n === schritt ? "bg-ca text-white" : "bg-bg-tertiary"}`}
          >
            {t(`neu.schritt_${n}`)}
          </li>
        ))}
      </ol>
      {rencontre && <p className="rounded-cid bg-ca/5 p-2 text-xs">{t("neu.aus_spielplan")}</p>}

      <div className={`${KARTE} space-y-2`}>
        {schritt === 1 && (
          <>
            <input
              className={FELD}
              aria-label={t("neu.titel")}
              placeholder={rencontre ? t("neu.titel_optional") : t("neu.titel")}
              value={f.titel}
              onChange={(e) => set("titel", e.target.value)}
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input
                className={FELD}
                aria-label={t("neu.ziel_ort")}
                placeholder={t("neu.ziel_ort")}
                value={wert(f.ziel_ort, v?.stadt)}
                onChange={(e) => set("ziel_ort", e.target.value)}
              />
              <input
                className={FELD}
                aria-label={t("neu.land")}
                placeholder={t("neu.land")}
                value={wert(f.land, v?.land)}
                onChange={(e) => set("land", e.target.value)}
              />
              <input
                className={FELD}
                aria-label={t("neu.stadion")}
                placeholder={t("neu.stadion")}
                value={wert(f.stadion, v?.stadion)}
                onChange={(e) => set("stadion", e.target.value)}
              />
            </div>
            {rencontre && !v?.stadion && (
              <p className="text-[11px] text-text-tertiary">{t("neu.stadion_hinweis")}</p>
            )}
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={f.datum_offen}
                onChange={(e) => set("datum_offen", e.target.checked)}
              />
              {t("neu.datum_offen")}
            </label>
            {!f.datum_offen && (
              <div className="grid grid-cols-2 gap-2">
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
              </div>
            )}
            {f.datum_offen && (
              <p className="text-[11px] text-text-tertiary">{t("neu.termin_hinweis")}</p>
            )}
          </>
        )}
        {schritt === 2 && (
          <>
            <label className="block text-xs">
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
            <label className="block text-xs">
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
            <div className="grid grid-cols-2 gap-2">
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
          </>
        )}
        {schritt === 3 && (
          <fieldset className="space-y-1">
            <legend className="text-xs font-semibold">{t("neu.vorlage")}</legend>
            {VORLAGEN.map((x) => (
              <label key={x} className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="vorlage"
                  checked={f.vorlage === x}
                  onChange={() => set("vorlage", x)}
                />
                <span>
                  {t(`vorlage.${x}`)}
                  <span className="block text-xs text-text-tertiary">
                    {t(`vorlage_hinweis.${x}`)}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <Fehler text={fehler} />
        <div className="flex justify-between pt-1">
          <button
            type="button"
            className={KNOPF_LEISE}
            disabled={schritt === 1}
            onClick={() => setSchritt(schritt - 1)}
          >
            {t("neu.zurueck")}
          </button>
          {schritt < 3 ? (
            <button
              type="button"
              className={KNOPF}
              disabled={!kannWeiter}
              onClick={() => setSchritt(schritt + 1)}
            >
              {t("neu.weiter")}
            </button>
          ) : (
            <button
              type="button"
              className={KNOPF}
              disabled={anlegen.isPending}
              onClick={erstellen}
            >
              {t("neu.erstellen")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
