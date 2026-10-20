/**
 * Formulaire "Spiel bearbeiten" / "Spiel hinzufügen" des Spielplans (2026-10-20) — nur für
 * Bureau Admin+ gerendert (CalendrierTab); die eigentliche Prüfung erfolgt serverseitig
 * (SpielplanPermission). Eine manuelle Korrektur (Datum/Uhrzeit, Ergebnis, Status) bleibt
 * bestehen, bis GOAL API einen abweichenden Stand liefert (siehe backend
 * services._appliquer_etat_api) — der Hinweistext im Formular sagt das ausdrücklich.
 * Spiele aus der API: nur Datum/Uhrzeit, Ergebnis und Status änderbar; von Hand hinzugefügte
 * Spiele (und neue) vollständig, inkl. Wettbewerb und Mannschaften.
 */
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  useCreerRencontre,
  useModifierRencontre,
  useReinitialiserRencontre,
  useSupprimerRencontre,
} from "../../hooks/useCommunaute";
import type {
  RencontreCalendrier,
  RencontreCalendrierPayload,
  StatutRencontre,
} from "../../types/communaute";
import { extractApiErrorMessage } from "../../utils/apiError";

const STATUTS: StatutRencontre[] = ["SCHEDULED", "FINISHED", "POSTPONED", "CANCELLED"];

const CLE_STATUT: Record<StatutRencontre, string> = {
  SCHEDULED: "live.calendrier_form_statut_programmee",
  FINISHED: "live.calendrier_form_statut_terminee",
  POSTPONED: "live.calendrier_statut_reportee",
  CANCELLED: "live.calendrier_statut_annulee",
};

const CHAMP = "w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm";
const LABEL = "mb-1 block text-xs font-medium text-text-secondary";

/** ISO (UTC) → Wert für <input type="datetime-local"> in lokaler Zeit. */
function isoVersLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function scoreVersTexte(score: number | null): string {
  return score === null ? "" : String(score);
}

interface Props {
  /** Zu bearbeitendes Spiel — `null` = neues Spiel hinzufügen. */
  rencontre: RencontreCalendrier | null;
  onClose: () => void;
}

export default function SpielplanEditForm({ rencontre, onClose }: Props) {
  const { t } = useTranslation("communaute");
  const neu = rencontre === null;
  const vollEditierbar = neu || rencontre.ajout_manuel;

  const [competition, setCompetition] = useState(rencontre?.competition ?? "Ligue 1");
  const [domicile, setDomicile] = useState(rencontre?.equipe_domicile ?? "Club Africain");
  const [exterieur, setExterieur] = useState(rencontre?.equipe_exterieur ?? "");
  const [datum, setDatum] = useState(rencontre ? isoVersLocal(rencontre.date_heure) : "");
  const [scoreHeim, setScoreHeim] = useState(scoreVersTexte(rencontre?.score_domicile ?? null));
  const [scoreGast, setScoreGast] = useState(scoreVersTexte(rencontre?.score_exterieur ?? null));
  const [statut, setStatut] = useState<StatutRencontre>(rencontre?.statut ?? "SCHEDULED");
  const [fehler, setFehler] = useState<string | null>(null);

  const erstellen = useCreerRencontre();
  const aendern = useModifierRencontre();
  const zuruecksetzen = useReinitialiserRencontre();
  const loeschen = useSupprimerRencontre();
  const beschaeftigt =
    erstellen.isPending || aendern.isPending || zuruecksetzen.isPending || loeschen.isPending;

  async function ausfuehren(aktion: () => Promise<unknown>) {
    setFehler(null);
    try {
      await aktion();
      onClose();
    } catch (error) {
      setFehler(extractApiErrorMessage(error, t("live.calendrier_form_fehler")));
    }
  }

  function absenden(event: FormEvent) {
    event.preventDefault();
    if (!datum) {
      setFehler(t("live.calendrier_form_datum_pflicht"));
      return;
    }
    const nurEins = (scoreHeim === "") !== (scoreGast === "");
    if (nurEins) {
      setFehler(t("live.calendrier_form_ergebnis_komplett"));
      return;
    }
    const payload: RencontreCalendrierPayload = {
      date_heure: new Date(datum).toISOString(),
      score_domicile: scoreHeim === "" ? null : Number(scoreHeim),
      score_exterieur: scoreGast === "" ? null : Number(scoreGast),
      statut,
    };
    if (vollEditierbar) {
      payload.competition = competition.trim();
      payload.equipe_domicile = domicile.trim();
      payload.equipe_exterieur = exterieur.trim();
    }
    void ausfuehren(() =>
      neu ? erstellen.mutateAsync(payload) : aendern.mutateAsync({ id: rencontre.id, payload }),
    );
  }

  return (
    <form
      onSubmit={absenden}
      aria-label={neu ? t("live.calendrier_form_titel_neu") : t("live.calendrier_form_titel")}
      className="mt-2 space-y-3 rounded-cid-lg border border-text-tertiary/20 bg-bg-secondary p-3"
    >
      <h3 className="text-xs font-bold uppercase text-text-tertiary">
        {neu ? t("live.calendrier_form_titel_neu") : t("live.calendrier_form_titel")}
      </h3>

      {vollEditierbar && (
        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <label className={LABEL} htmlFor="sp-wettbewerb">
              {t("live.calendrier_form_wettbewerb")}
            </label>
            <input
              id="sp-wettbewerb"
              className={CHAMP}
              value={competition}
              onChange={(e) => setCompetition(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="sp-heim">
              {t("live.calendrier_form_heim")}
            </label>
            <input
              id="sp-heim"
              required
              className={CHAMP}
              value={domicile}
              onChange={(e) => setDomicile(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="sp-gast">
              {t("live.calendrier_form_gast")}
            </label>
            <input
              id="sp-gast"
              required
              className={CHAMP}
              value={exterieur}
              onChange={(e) => setExterieur(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <label className={LABEL} htmlFor="sp-datum">
            {t("live.calendrier_form_datum")}
          </label>
          <input
            id="sp-datum"
            type="datetime-local"
            required
            className={CHAMP}
            value={datum}
            onChange={(e) => setDatum(e.target.value)}
          />
        </div>
        <div>
          <span className={LABEL}>{t("live.calendrier_form_ergebnis")}</span>
          <div className="flex items-center gap-1">
            <input
              aria-label={t("live.calendrier_form_tore_heim")}
              type="number"
              min={0}
              max={99}
              className={CHAMP}
              value={scoreHeim}
              onChange={(e) => setScoreHeim(e.target.value)}
            />
            <span className="text-sm text-text-tertiary">:</span>
            <input
              aria-label={t("live.calendrier_form_tore_gast")}
              type="number"
              min={0}
              max={99}
              className={CHAMP}
              value={scoreGast}
              onChange={(e) => setScoreGast(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className={LABEL} htmlFor="sp-status">
            {t("live.calendrier_form_statut")}
          </label>
          <select
            id="sp-status"
            className={CHAMP}
            value={statut}
            onChange={(e) => setStatut(e.target.value as StatutRencontre)}
          >
            {STATUTS.map((s) => (
              <option key={s} value={s}>
                {t(CLE_STATUT[s])}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!neu && !rencontre.ajout_manuel && (
        <p className="text-xs text-text-tertiary">{t("live.calendrier_form_hinweis_api")}</p>
      )}
      {fehler && (
        <p role="alert" className="text-xs text-status-dangerText">
          {fehler}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-text-tertiary/10 pt-3">
        <button
          type="submit"
          disabled={beschaeftigt}
          className="rounded-cid bg-ca px-4 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
        >
          {t("live.calendrier_form_speichern")}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={beschaeftigt}
          className="rounded-cid bg-bg-primary px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-cal"
        >
          {t("live.calendrier_form_abbrechen")}
        </button>
        {!neu && !rencontre.ajout_manuel && rencontre.modifie_manuellement && (
          <button
            type="button"
            disabled={beschaeftigt}
            onClick={() => void ausfuehren(() => zuruecksetzen.mutateAsync(rencontre.id))}
            className="rounded-cid bg-bg-primary px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-cal"
          >
            {t("live.calendrier_form_zuruecksetzen")}
          </button>
        )}
        {!neu && rencontre.ajout_manuel && (
          <button
            type="button"
            disabled={beschaeftigt}
            onClick={() => void ausfuehren(() => loeschen.mutateAsync(rencontre.id))}
            className="ml-auto rounded-cid bg-status-dangerBg px-3 py-1.5 text-xs font-medium text-status-dangerText"
          >
            {t("live.calendrier_form_loeschen")}
          </button>
        )}
      </div>
    </form>
  );
}
