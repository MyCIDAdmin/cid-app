/** Reiter „Infos“ : Mitteilungen der Organisation (wichtig = angeheftet), mit „Gelesen“. */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import FormatierterText from "../regionen/FormatierterText";
import RichTextEditor from "../ui/RichTextEditor";
import { useInfoAnlegen, useInfoGelesen, useInfoLoeschen, useInfos } from "../../hooks/useReisen";
import { extractApiErrorMessage } from "../../utils/apiError";
import { datumKurz } from "../../utils/reisen";
import type { ReiseDetail } from "../../types/reisen";
import { FELD, Fehler, KARTE, KNOPF, KNOPF_LEISE } from "./ui";

export default function InfosTab({ reise }: { reise: ReiseDetail }) {
  const { t, i18n } = useTranslation("reisen");
  const q = useInfos(reise.id, reise.voll);
  const anlegen = useInfoAnlegen(reise.id);
  const loeschen = useInfoLoeschen(reise.id);
  const gelesen = useInfoGelesen(reise.id);
  const [titel, setTitel] = useState("");
  const [text, setText] = useState("");
  const [wichtig, setWichtig] = useState(false);
  const [pflicht, setPflicht] = useState(false);
  const [bis, setBis] = useState("");
  const [fehler, setFehler] = useState("");

  function neu(ev: React.FormEvent) {
    ev.preventDefault();
    if (!titel.trim()) return;
    anlegen.mutate(
      { titel, text, wichtig, gelesen_pflicht: pflicht, gueltig_bis: bis || null },
      {
        onSuccess: () => {
          setTitel("");
          setText("");
          setWichtig(false);
          setPflicht(false);
          setBis("");
          setFehler("");
        },
        onError: (e) => setFehler(extractApiErrorMessage(e, t("fehler.allgemein"))),
      },
    );
  }

  return (
    <div className="space-y-3">
      {reise.kann_verwalten && (
        <form onSubmit={neu} className={`${KARTE} space-y-2`} aria-label={t("infos.neu")}>
          <input
            className={FELD}
            aria-label={t("infos.titel")}
            placeholder={t("infos.titel")}
            value={titel}
            onChange={(e) => setTitel(e.target.value)}
          />
          <RichTextEditor
            value={text}
            onChange={setText}
            placeholder={t("infos.text")}
            ariaLabel={t("infos.text")}
          />
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={wichtig}
                onChange={(e) => setWichtig(e.target.checked)}
              />
              {t("infos.wichtig_markieren")}
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={pflicht}
                onChange={(e) => setPflicht(e.target.checked)}
              />
              {t("infos.gelesen_pflicht")}
            </label>
            <label className="flex items-center gap-1">
              {t("infos.gueltig_bis")}
              <input
                type="date"
                className="rounded-cid border border-text-tertiary/30 px-2 py-1"
                value={bis}
                onChange={(e) => setBis(e.target.value)}
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" className={KNOPF} disabled={anlegen.isPending}>
              {t("infos.veroeffentlichen")}
            </button>
            <Fehler text={fehler} />
          </div>
        </form>
      )}
      {(q.data ?? []).length === 0 && !q.isLoading && (
        <p className="text-sm text-text-tertiary">{t("infos.leer")}</p>
      )}
      <ul className="space-y-2">
        {(q.data ?? []).map((i) => (
          <li key={i.id} className={`${KARTE} ${i.wichtig ? "border border-ca/40" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold">
                {i.wichtig && <span className="mr-1 text-ca">★</span>}
                {i.titel}
              </p>
              <span className="text-[11px] text-text-tertiary">
                {datumKurz(i.erstellt, i18n.language)}
                {i.gueltig_bis
                  ? ` · ${t("infos.bis", { datum: datumKurz(i.gueltig_bis, i18n.language) })}`
                  : ""}
              </span>
            </div>
            <FormatierterText text={i.text} />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {i.gelesen_pflicht && !i.gelesen && (
                <button type="button" className={KNOPF} onClick={() => gelesen.mutate(i.id)}>
                  {t("infos.gelesen")}
                </button>
              )}
              {i.gelesen_pflicht && i.gelesen && (
                <span className="text-xs text-green-700">{t("infos.gelesen_ok")}</span>
              )}
              {i.ausstehend && i.ausstehend.length > 0 && (
                <span className="text-[11px] text-text-tertiary">
                  {t("infos.ausstehend", { namen: i.ausstehend.join(", ") })}
                </span>
              )}
              {reise.kann_verwalten && (
                <button type="button" className={KNOPF_LEISE} onClick={() => loeschen.mutate(i.id)}>
                  {t("loeschen")}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
