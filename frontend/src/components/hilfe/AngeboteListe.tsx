/**
 * Angebote der Mitglieder („Ich helfe gern bei …“). Mitglieder sehen und ziehen zurück ihre
 * eigenen Angebote ; wer „Meldungen genehmigen“ darf (Büro) sieht alle, nimmt sie an (optional mit
 * Zuordnung zu einem offenen Gesuch) oder lehnt sie ab. Die Person wird per Glocke, Telegram und
 * Mail benachrichtigt.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import FormatierterText from "../regionen/FormatierterText";
import {
  useFreieStellen,
  useHilfeAngebotEntscheiden,
  useHilfeAngebotZurueckziehen,
  useHilfeAngebote,
} from "../../hooks/useProjets";
import type { HilfeAngebot } from "../../types/projets";
import { extractApiErrorMessage } from "../../utils/apiError";
import { lokaleSprache } from "../../utils/datum";
import { kategorieName } from "../../utils/hilfe";
import AngebotForm from "./AngebotForm";

const STATUS_STIL: Record<HilfeAngebot["status"], string> = {
  offen: "bg-status-warningBg text-status-warningText",
  angenommen: "bg-status-successBg text-status-successText",
  abgelehnt: "bg-bg-secondary text-text-tertiary",
  zurueckgezogen: "bg-bg-secondary text-text-tertiary",
};

function AngebotKarte({
  angebot,
  darfEntscheiden,
}: {
  angebot: HilfeAngebot;
  darfEntscheiden: boolean;
}) {
  const { t, i18n } = useTranslation("projets");
  const entscheiden = useHilfeAngebotEntscheiden();
  const zurueckziehen = useHilfeAngebotZurueckziehen();
  const freie = useFreieStellen();
  const [notiz, setNotiz] = useState("");
  const [stelle, setStelle] = useState("");
  const [fehler, setFehler] = useState("");
  const offen = angebot.status === "offen";
  const offeneGesuche = (freie.data ?? []).filter((s) => s.status === "offen");
  const name = angebot.membre_detail
    ? `${angebot.membre_detail.prenom} ${angebot.membre_detail.nom}`.trim()
    : "";

  function entscheidung(wert: "annehmen" | "ablehnen") {
    setFehler("");
    entscheiden.mutate(
      {
        id: angebot.id,
        entscheidung: wert,
        extra: { notiz: notiz.trim(), ...(wert === "annehmen" && stelle ? { stelle } : {}) },
      },
      { onError: (err) => setFehler(extractApiErrorMessage(err, t("stellen.fehler"))) },
    );
  }

  return (
    <li
      className="space-y-2 rounded-cid border border-text-tertiary/20 bg-bg-primary p-3"
      data-testid="angebot-karte"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-text-primary">{angebot.titel}</h3>
          <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-medium">
            {darfEntscheiden && name && (
              <span className="rounded-full bg-bg-secondary px-2 py-0.5 text-text-secondary">
                {name}
              </span>
            )}
            {angebot.kategorie_detail && (
              <span className="rounded-full bg-ca/10 px-2 py-0.5 text-ca">
                {kategorieName(angebot.kategorie_detail, i18n.language)}
              </span>
            )}
            {angebot.verfuegbarkeit && (
              <span className="rounded-full bg-bg-secondary px-2 py-0.5 text-text-secondary">
                🕒 {angebot.verfuegbarkeit}
              </span>
            )}
          </div>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STIL[angebot.status]}`}
        >
          {t(`hilfe.angebot.status.${angebot.status}`)}
        </span>
      </div>

      {angebot.beschreibung && <FormatierterText text={angebot.beschreibung} />}
      <p className="text-[11px] text-text-tertiary">
        {new Date(angebot.created_at).toLocaleDateString(lokaleSprache())}
      </p>
      {angebot.stelle_titel && (
        <p className="text-xs text-status-successText">
          {t("hilfe.angebot.zugeordnet", { titel: angebot.stelle_titel })}
        </p>
      )}
      {angebot.notiz && !offen && (
        <p className="text-xs text-text-secondary">
          {t("hilfe.angebot.notiz_buero")}: {angebot.notiz}
        </p>
      )}

      {offen && darfEntscheiden && (
        <div className="space-y-2 border-t border-text-tertiary/15 pt-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              value={stelle}
              onChange={(e) => setStelle(e.target.value)}
              aria-label={t("hilfe.angebot.zuordnen")}
              className="w-full rounded-cid border border-text-tertiary/30 bg-bg-primary px-2 py-1.5 text-sm"
            >
              <option value="">{t("hilfe.angebot.ohne_zuordnung")}</option>
              {offeneGesuche.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.titel}
                </option>
              ))}
            </select>
            <input
              value={notiz}
              onChange={(e) => setNotiz(e.target.value)}
              maxLength={300}
              aria-label={t("hilfe.angebot.notiz_label")}
              placeholder={t("hilfe.angebot.notiz_label")}
              className="w-full rounded-cid border border-text-tertiary/30 bg-bg-primary px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={entscheiden.isPending}
              onClick={() => entscheidung("annehmen")}
              className="rounded-cid bg-ca px-3 py-1 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
            >
              {t("hilfe.angebot.annehmen")}
            </button>
            <button
              type="button"
              disabled={entscheiden.isPending}
              onClick={() => entscheidung("ablehnen")}
              className="rounded-cid px-3 py-1 text-xs font-medium text-text-secondary hover:bg-bg-secondary disabled:opacity-50"
            >
              {t("hilfe.angebot.ablehnen")}
            </button>
          </div>
        </div>
      )}
      {offen && angebot.ist_meins && (
        <button
          type="button"
          disabled={zurueckziehen.isPending}
          onClick={() => zurueckziehen.mutate(angebot.id)}
          className="text-xs text-text-tertiary underline"
        >
          {t("hilfe.angebot.zurueckziehen")}
        </button>
      )}
      {fehler && (
        <p role="alert" className="text-xs text-status-dangerText">
          {fehler}
        </p>
      )}
    </li>
  );
}

export default function AngeboteListe({ darfEntscheiden }: { darfEntscheiden: boolean }) {
  const { t } = useTranslation("projets");
  const angebote = useHilfeAngebote();
  const [formOffen, setFormOffen] = useState(false);
  const liste = angebote.data ?? [];

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-secondary">
        {darfEntscheiden ? t("hilfe.angebot.einleitung_buero") : t("hilfe.angebot.einleitung")}
      </p>
      {formOffen ? (
        <AngebotForm onFertig={() => setFormOffen(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setFormOffen(true)}
          className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad"
        >
          + {t("hilfe.angebot.neu")}
        </button>
      )}
      {angebote.isLoading ? (
        <p className="text-sm text-text-tertiary">{t("hilfe.laedt")}</p>
      ) : liste.length === 0 ? (
        <p className="rounded-cid bg-bg-secondary p-4 text-sm text-text-secondary">
          {t("hilfe.angebot.leer")}
        </p>
      ) : (
        <ul className="space-y-2">
          {liste.map((a) => (
            <AngebotKarte key={a.id} angebot={a} darfEntscheiden={darfEntscheiden} />
          ))}
        </ul>
      )}
    </div>
  );
}
