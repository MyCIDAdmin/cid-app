/** Reiter „Checkliste“ : gemeinsame Punkte der Organisation (jede Person hakt für sich ab) und eigene Punkte. */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useChecklisteAnlegen,
  useChecklisteErledigt,
  useChecklisteLoeschen,
  useCheckliste,
} from "../../hooks/useReisen";
import { extractApiErrorMessage } from "../../utils/apiError";
import { datumKurz } from "../../utils/reisen";
import type { ChecklistePunkt, ReiseDetail } from "../../types/reisen";
import { FELD, Fehler, KARTE, KNOPF } from "./ui";
import ZielgruppeWahl, { GruppenChip } from "./ZielgruppeWahl";

function Punkt({ reise, p }: { reise: ReiseDetail; p: ChecklistePunkt }) {
  const { t, i18n } = useTranslation("reisen");
  const erledigt = useChecklisteErledigt(reise.id);
  const loeschen = useChecklisteLoeschen(reise.id);
  return (
    <li className={`${KARTE} flex flex-wrap items-center justify-between gap-2`}>
      <label className="flex min-w-0 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={p.erledigt}
          aria-label={p.titel}
          onChange={(e) => erledigt.mutate({ pid: p.id, erledigt: e.target.checked })}
        />
        <span className={p.erledigt ? "text-text-tertiary line-through" : ""}>{p.titel}</span>
        <GruppenChip name={p.teilgruppe_name} />
      </label>
      <span className="flex items-center gap-2 text-[11px] text-text-tertiary">
        {p.frist && (
          <span className={p.ueberfaellig ? "font-medium text-red-600" : ""}>
            {p.ueberfaellig ? `${t("checkliste.ueberfaellig")} · ` : ""}
            {t("checkliste.bis", { datum: datumKurz(p.frist, i18n.language) })}
          </span>
        )}
        {p.gesamt !== undefined && (
          <span data-testid="checkliste-zaehler">
            {t("checkliste.zaehler", { zahl: p.erledigt_zahl ?? 0, gesamt: p.gesamt })}
          </span>
        )}
        {p.kann_aendern && (
          <button type="button" className="text-red-600" onClick={() => loeschen.mutate(p.id)}>
            {t("loeschen")}
          </button>
        )}
      </span>
    </li>
  );
}

export default function ChecklisteTab({ reise }: { reise: ReiseDetail }) {
  const { t } = useTranslation("reisen");
  const q = useCheckliste(reise.id, reise.voll);
  const anlegen = useChecklisteAnlegen(reise.id);
  const [titel, setTitel] = useState("");
  const [frist, setFrist] = useState("");
  const [persoenlich, setPersoenlich] = useState(!reise.kann_verwalten);
  const [teilgruppe, setTeilgruppe] = useState("");
  const [fehler, setFehler] = useState("");
  const punkte = q.data ?? [];
  const gemeinsam = punkte.filter((p) => !p.persoenlich);
  const eigene = punkte.filter((p) => p.persoenlich);
  const kannPersoenlich = Boolean(reise.meine);
  const kannGemeinsam = reise.kann_verwalten;

  function neu(ev: React.FormEvent) {
    ev.preventDefault();
    if (!titel.trim()) return;
    anlegen.mutate(
      {
        titel,
        frist: frist || null,
        persoenlich,
        teilgruppe: persoenlich ? null : teilgruppe || null,
      },
      {
        onSuccess: () => {
          setTitel("");
          setFrist("");
          setTeilgruppe("");
          setFehler("");
        },
        onError: (e) => setFehler(extractApiErrorMessage(e, t("fehler.allgemein"))),
      },
    );
  }

  return (
    <div className="space-y-4">
      {(kannPersoenlich || kannGemeinsam) && (
        <form onSubmit={neu} className={`${KARTE} space-y-2`} aria-label={t("checkliste.neu")}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              className={`${FELD} sm:col-span-2`}
              aria-label={t("checkliste.titel")}
              placeholder={t("checkliste.titel")}
              value={titel}
              onChange={(e) => setTitel(e.target.value)}
            />
            <input
              type="date"
              className={FELD}
              aria-label={t("checkliste.frist")}
              value={frist}
              onChange={(e) => setFrist(e.target.value)}
            />
          </div>
          {kannPersoenlich && kannGemeinsam && (
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={persoenlich}
                onChange={(e) => setPersoenlich(e.target.checked)}
              />
              {t("checkliste.nur_fuer_mich")}
            </label>
          )}
          {!persoenlich && (
            <ZielgruppeWahl reiseId={reise.id} value={teilgruppe} onChange={setTeilgruppe} />
          )}
          <div className="flex items-center gap-2">
            <button type="submit" className={KNOPF} disabled={anlegen.isPending}>
              {t("checkliste.hinzufuegen")}
            </button>
            <Fehler text={fehler} />
          </div>
        </form>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{t("checkliste.gemeinsam")}</h2>
        {gemeinsam.length === 0 && !q.isLoading && (
          <p className="text-xs text-text-tertiary">{t("checkliste.leer")}</p>
        )}
        <ul className="space-y-1.5">
          {gemeinsam.map((p) => (
            <Punkt key={p.id} reise={reise} p={p} />
          ))}
        </ul>
      </section>

      {kannPersoenlich && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">{t("checkliste.eigene")}</h2>
          <p className="text-[11px] text-text-tertiary">{t("checkliste.eigene_hinweis")}</p>
          <ul className="space-y-1.5">
            {eigene.map((p) => (
              <Punkt key={p.id} reise={reise} p={p} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
