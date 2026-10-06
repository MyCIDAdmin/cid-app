import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useAufgabeAendern,
  useAufgabeErstellen,
  useAufgabeLoeschen,
  useKommentarErstellen,
  useKommentarLoeschen,
  useKommentare,
} from "../../../hooks/useProjets";
import type {
  Aufgabe,
  PrioritaetAufgabe,
  ProjetMitglied,
  StatutAufgabe,
} from "../../../types/projets";
import { extractApiErrorMessage } from "../../../utils/apiError";
import { STATUS_REIHENFOLGE } from "./konstanten";

const CHAMP = "w-full rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm";
const LABEL = "mb-1 block text-[10px] uppercase text-text-tertiary";
const PRIORITAETEN: PrioritaetAufgabe[] = ["niedrig", "normal", "hoch"];

function Kommentare({
  aufgabe,
  bearbeitbar,
  kannLoeschen,
}: {
  aufgabe: Aufgabe;
  bearbeitbar: boolean;
  kannLoeschen: boolean;
}) {
  const { t } = useTranslation("projets");
  const kommentare = useKommentare(aufgabe.id);
  const erstellen = useKommentarErstellen();
  const loeschen = useKommentarLoeschen();
  const [text, setText] = useState("");

  async function senden(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    await erstellen.mutateAsync({ aufgabe: aufgabe.id, text: text.trim() });
    setText("");
  }

  return (
    <div className="mt-4 space-y-2 border-t border-text-tertiary/20 pt-3">
      <h3 className="text-xs font-semibold uppercase text-text-secondary">
        {t("arbeitsbereich.modal.kommentare")}
      </h3>
      {kommentare.data?.length === 0 && (
        <p className="text-xs text-text-tertiary">{t("arbeitsbereich.modal.keine_kommentare")}</p>
      )}
      {kommentare.data?.map((k) => (
        <div key={k.id} className="rounded-cid bg-bg-secondary p-2 text-sm">
          <div className="flex items-center justify-between text-xs text-text-tertiary">
            <span>
              {k.autor_detail ? `${k.autor_detail.prenom} ${k.autor_detail.nom}` : ""}
              {" · "}
              {new Date(k.created_at).toLocaleString()}
            </span>
            {kannLoeschen && (
              <button
                type="button"
                onClick={() => loeschen.mutate(k.id)}
                className="text-status-dangerText"
              >
                {t("arbeitsbereich.modal.kommentar_loeschen")}
              </button>
            )}
          </div>
          <p className="mt-1 whitespace-pre-wrap text-text-primary">{k.text}</p>
        </div>
      ))}
      {bearbeitbar && (
        <form onSubmit={senden} className="flex gap-2">
          <input
            aria-label={t("arbeitsbereich.modal.kommentar_platzhalter")}
            placeholder={t("arbeitsbereich.modal.kommentar_platzhalter")}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className={CHAMP}
          />
          <button
            type="submit"
            disabled={erstellen.isPending}
            className="rounded-cid bg-ca px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
          >
            {t("arbeitsbereich.modal.kommentar_hinzufuegen")}
          </button>
        </form>
      )}
    </div>
  );
}

/** Création/modification d'une tâche + commentaires (2026-10-06). */
export default function AufgabeModal({
  projetId,
  aufgabe,
  startStatus,
  team,
  bearbeitbar,
  kannLoeschen,
  onClose,
}: {
  projetId: string;
  aufgabe: Aufgabe | null;
  startStatus: StatutAufgabe;
  team: ProjetMitglied[];
  bearbeitbar: boolean;
  kannLoeschen: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation("projets");
  const erstellen = useAufgabeErstellen();
  const aendern = useAufgabeAendern();
  const loeschen = useAufgabeLoeschen();
  const [titel, setTitel] = useState(aufgabe?.titel ?? "");
  const [beschreibung, setBeschreibung] = useState(aufgabe?.beschreibung ?? "");
  const [verantwortlich, setVerantwortlich] = useState(aufgabe?.verantwortlich ?? "");
  const [frist, setFrist] = useState(aufgabe?.frist ?? "");
  const [prioritaet, setPrioritaet] = useState<PrioritaetAufgabe>(aufgabe?.prioritaet ?? "normal");
  const [status, setStatus] = useState<StatutAufgabe>(aufgabe?.status ?? startStatus);
  const [erreur, setErreur] = useState("");

  async function speichern(e: React.FormEvent) {
    e.preventDefault();
    setErreur("");
    const daten = {
      titel: titel.trim(),
      beschreibung,
      verantwortlich: verantwortlich || null,
      frist: frist || null,
      prioritaet,
      status,
    };
    try {
      if (aufgabe) await aendern.mutateAsync({ id: aufgabe.id, payload: daten });
      else await erstellen.mutateAsync({ projet: projetId, ...daten });
      onClose();
    } catch (error) {
      setErreur(extractApiErrorMessage(error, t("arbeitsbereich.fehler")));
    }
  }

  async function entfernen() {
    if (!aufgabe) return;
    try {
      await loeschen.mutateAsync(aufgabe.id);
      onClose();
    } catch (error) {
      setErreur(extractApiErrorMessage(error, t("arbeitsbereich.fehler")));
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={
        aufgabe
          ? t("arbeitsbereich.modal.aufgabe_bearbeiten")
          : t("arbeitsbereich.modal.neue_aufgabe")
      }
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-cid-lg bg-bg-primary p-5 shadow-xl">
        <form onSubmit={speichern}>
          <h2 className="mb-4 text-base font-semibold text-text-primary">
            {aufgabe
              ? t("arbeitsbereich.modal.aufgabe_bearbeiten")
              : t("arbeitsbereich.modal.neue_aufgabe")}
          </h2>
          <fieldset disabled={!bearbeitbar} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-2">
              <label htmlFor="aufg-titel" className={LABEL}>
                {t("arbeitsbereich.modal.titel")}
              </label>
              <input
                id="aufg-titel"
                required
                maxLength={200}
                value={titel}
                onChange={(e) => setTitel(e.target.value)}
                className={CHAMP}
              />
            </div>
            <div className="col-span-2">
              <label htmlFor="aufg-beschreibung" className={LABEL}>
                {t("arbeitsbereich.modal.beschreibung")}
              </label>
              <textarea
                id="aufg-beschreibung"
                rows={3}
                value={beschreibung}
                onChange={(e) => setBeschreibung(e.target.value)}
                className={CHAMP}
              />
            </div>
            <div>
              <label htmlFor="aufg-verantwortlich" className={LABEL}>
                {t("arbeitsbereich.modal.verantwortlich")}
              </label>
              <select
                id="aufg-verantwortlich"
                value={verantwortlich}
                onChange={(e) => setVerantwortlich(e.target.value)}
                className={CHAMP}
              >
                <option value="">{t("arbeitsbereich.modal.niemand")}</option>
                {team.map((m) => (
                  <option key={m.membre} value={m.membre}>
                    {m.membre_detail ? `${m.membre_detail.prenom} ${m.membre_detail.nom}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="aufg-frist" className={LABEL}>
                {t("arbeitsbereich.modal.frist")}
              </label>
              <input
                id="aufg-frist"
                type="date"
                value={frist}
                onChange={(e) => setFrist(e.target.value)}
                className={CHAMP}
              />
            </div>
            <div>
              <label htmlFor="aufg-prio" className={LABEL}>
                {t("arbeitsbereich.modal.prioritaet")}
              </label>
              <select
                id="aufg-prio"
                value={prioritaet}
                onChange={(e) => setPrioritaet(e.target.value as PrioritaetAufgabe)}
                className={CHAMP}
              >
                {PRIORITAETEN.map((p) => (
                  <option key={p} value={p}>
                    {t(`arbeitsbereich.prioritaet.${p}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="aufg-status" className={LABEL}>
                {t("arbeitsbereich.modal.status")}
              </label>
              <select
                id="aufg-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as StatutAufgabe)}
                className={CHAMP}
              >
                {STATUS_REIHENFOLGE.map((s) => (
                  <option key={s} value={s}>
                    {t(`arbeitsbereich.status.${s}`)}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>
          {erreur && <p className="mt-3 text-xs text-status-dangerText">{erreur}</p>}
          <div className="mt-5 flex items-center justify-between gap-2">
            <div>
              {aufgabe && kannLoeschen && (
                <button
                  type="button"
                  onClick={entfernen}
                  className="rounded-cid border border-status-dangerText/40 px-3 py-1.5 text-sm text-status-dangerText"
                >
                  {t("arbeitsbereich.modal.loeschen")}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary"
              >
                {t("arbeitsbereich.modal.schliessen")}
              </button>
              {bearbeitbar && (
                <button
                  type="submit"
                  disabled={erstellen.isPending || aendern.isPending}
                  className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {t("arbeitsbereich.modal.speichern")}
                </button>
              )}
            </div>
          </div>
        </form>
        {aufgabe && (
          <Kommentare aufgabe={aufgabe} bearbeitbar={bearbeitbar} kannLoeschen={kannLoeschen} />
        )}
      </div>
    </div>
  );
}
