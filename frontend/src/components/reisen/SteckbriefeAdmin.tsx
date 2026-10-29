/** Pflege der Ländersteckbriefe (nur Bureau Admin und höher). */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import RichTextEditor from "../ui/RichTextEditor";
import {
  useLaenderprofile,
  useLaenderprofilLoeschen,
  useLaenderprofilSpeichern,
} from "../../hooks/useReisen";
import { extractApiErrorMessage } from "../../utils/apiError";
import type { Laenderprofil, LaenderprofilEingabe } from "../../types/reisen";
import { FELD, Fehler, KARTE, KNOPF, KNOPF_LEISE } from "./ui";

const LEER: LaenderprofilEingabe = {
  land: "",
  einreise: "",
  waehrung: "",
  zeitverschiebung: "",
  steckdose: "",
  amtliche_hinweise: "",
  weitere_infos: "",
};

function Formular({
  start,
  id,
  onFertig,
}: {
  start: LaenderprofilEingabe;
  id?: string;
  onFertig: () => void;
}) {
  const { t } = useTranslation("reisen");
  const speichern = useLaenderprofilSpeichern();
  const [f, setF] = useState<LaenderprofilEingabe>(start);
  const [fehler, setFehler] = useState("");
  const set = (k: keyof LaenderprofilEingabe, v: string) => setF({ ...f, [k]: v });
  const feld = (k: keyof LaenderprofilEingabe) => (
    <input
      className={FELD}
      aria-label={t(`steckbrief.${k}`)}
      placeholder={t(`steckbrief.${k}`)}
      value={f[k] ?? ""}
      onChange={(e) => set(k, e.target.value)}
    />
  );
  function senden(ev: React.FormEvent) {
    ev.preventDefault();
    if (!f.land?.trim()) return;
    speichern.mutate(
      { id, daten: f },
      {
        onSuccess: onFertig,
        onError: (e) => setFehler(extractApiErrorMessage(e, t("fehler.allgemein"))),
      },
    );
  }
  return (
    <form onSubmit={senden} className={`${KARTE} space-y-2`} aria-label={t("steckbrief.formular")}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {feld("land")}
        {feld("waehrung")}
        {feld("zeitverschiebung")}
        {feld("steckdose")}
      </div>
      <p className="text-[11px] text-text-tertiary">{t("steckbrief.einreise")}</p>
      <RichTextEditor
        value={f.einreise ?? ""}
        onChange={(v) => set("einreise", v)}
        ariaLabel={t("steckbrief.einreise")}
      />
      {feld("amtliche_hinweise")}
      <p className="text-[11px] text-text-tertiary">{t("steckbrief.weitere_infos")}</p>
      <RichTextEditor
        value={f.weitere_infos ?? ""}
        onChange={(v) => set("weitere_infos", v)}
        ariaLabel={t("steckbrief.weitere_infos")}
      />
      <div className="flex items-center gap-2">
        <button type="submit" className={KNOPF} disabled={speichern.isPending}>
          {t("steckbrief.speichern")}
        </button>
        <button type="button" className={KNOPF_LEISE} onClick={onFertig}>
          {t("abbrechen")}
        </button>
        <Fehler text={fehler} />
      </div>
    </form>
  );
}

export default function SteckbriefeAdmin() {
  const { t } = useTranslation("reisen");
  const q = useLaenderprofile();
  const loeschen = useLaenderprofilLoeschen();
  const [bearbeite, setBearbeite] = useState<Laenderprofil | "neu" | null>(null);
  return (
    <div className="space-y-3">
      <p className="text-xs text-text-secondary">{t("steckbrief.admin_hinweis")}</p>
      {bearbeite ? (
        <Formular
          key={bearbeite === "neu" ? "neu" : bearbeite.id}
          start={bearbeite === "neu" ? LEER : bearbeite}
          id={bearbeite === "neu" ? undefined : bearbeite.id}
          onFertig={() => setBearbeite(null)}
        />
      ) : (
        <button type="button" className={KNOPF} onClick={() => setBearbeite("neu")}>
          {t("steckbrief.neu")}
        </button>
      )}
      {(q.data ?? []).length === 0 && !q.isLoading && (
        <p className="text-sm text-text-tertiary">{t("steckbrief.leer")}</p>
      )}
      <ul className="space-y-1.5">
        {(q.data ?? []).map((p) => (
          <li key={p.id} className={`${KARTE} flex items-center justify-between gap-2 text-sm`}>
            <span>
              <b>{p.land}</b>
              <span className="ml-2 text-xs text-text-tertiary">{p.stand}</span>
            </span>
            <span className="flex gap-2">
              <button type="button" className={KNOPF_LEISE} onClick={() => setBearbeite(p)}>
                {t("steckbrief.bearbeiten")}
              </button>
              <button
                type="button"
                className="text-xs text-red-600"
                onClick={() => loeschen.mutate(p.id)}
              >
                {t("loeschen")}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
