/** Teilgruppen einer Reise : alle sehen Name und Größe, Mitglieder und Organisation die Namen.
 * Die Organisation legt an (auch aus Vorschlägen: gleicher Abflugort, gleiche Unterkunft). */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useTeilgruppeAendern,
  useTeilgruppeAnlegen,
  useTeilgruppeLoeschen,
  useTeilgruppen,
} from "../../hooks/useReisen";
import { extractApiErrorMessage } from "../../utils/apiError";
import type { ReiseDetail, Teilnehmer } from "../../types/reisen";
import { FELD, Fehler, KARTE, KNOPF, KNOPF_LEISE } from "./ui";

function GruppenForm({
  reiseId,
  dabei,
  start,
  onFertig,
}: {
  reiseId: string;
  dabei: Teilnehmer[];
  start: { id?: string; name: string; teilnehmer: string[] };
  onFertig: () => void;
}) {
  const { t } = useTranslation("reisen");
  const anlegen = useTeilgruppeAnlegen(reiseId);
  const aendern = useTeilgruppeAendern(reiseId);
  const [name, setName] = useState(start.name);
  const [auswahl, setAuswahl] = useState(new Set(start.teilnehmer));
  const [fehler, setFehler] = useState("");

  function senden(ev: React.FormEvent) {
    ev.preventDefault();
    if (!name.trim()) return;
    const daten = { name, teilnehmer: [...auswahl] };
    const opts = {
      onSuccess: onFertig,
      onError: (e: unknown) => setFehler(extractApiErrorMessage(e, t("fehler.allgemein"))),
    };
    if (start.id) aendern.mutate({ gid: start.id, ...daten }, opts);
    else anlegen.mutate(daten, opts);
  }

  return (
    <form onSubmit={senden} className={`${KARTE} space-y-2`} aria-label={t("gruppen.formular")}>
      <input
        className={FELD}
        aria-label={t("gruppen.name")}
        placeholder={t("gruppen.name")}
        value={name}
        maxLength={100}
        onChange={(e) => setName(e.target.value)}
      />
      <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {dabei.map((x) => (
          <li key={x.id}>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={auswahl.has(x.id)}
                onChange={(e) => {
                  const neu = new Set(auswahl);
                  if (e.target.checked) neu.add(x.id);
                  else neu.delete(x.id);
                  setAuswahl(neu);
                }}
              />
              {x.name}
            </label>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <button type="submit" className={KNOPF}>
          {t("gruppen.speichern")}
        </button>
        <button type="button" className={KNOPF_LEISE} onClick={onFertig}>
          {t("abbrechen")}
        </button>
        <Fehler text={fehler} />
      </div>
    </form>
  );
}

export default function TeilgruppenAbschnitt({
  reise,
  teilnehmer,
}: {
  reise: ReiseDetail;
  teilnehmer: Teilnehmer[];
}) {
  const { t } = useTranslation("reisen");
  const q = useTeilgruppen(reise.id, reise.voll);
  const loeschen = useTeilgruppeLoeschen(reise.id);
  const [form, setForm] = useState<{ id?: string; name: string; teilnehmer: string[] } | null>(
    null,
  );
  const gruppen = q.data?.gruppen ?? [];
  const vorschlaege = q.data?.vorschlaege ?? [];
  const dabei = teilnehmer.filter((x) => x.status === "dabei");
  if (gruppen.length === 0 && !reise.kann_verwalten) return null;

  return (
    <section className="space-y-2" aria-label={t("gruppen.titel")}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t("gruppen.titel")}</h2>
        {reise.kann_verwalten && !form && (
          <button
            type="button"
            className={KNOPF}
            onClick={() => setForm({ name: "", teilnehmer: [] })}
          >
            {t("gruppen.neu")}
          </button>
        )}
      </div>
      {form && (
        <GruppenForm
          key={form.id ?? form.name}
          reiseId={reise.id}
          dabei={dabei}
          start={form}
          onFertig={() => setForm(null)}
        />
      )}
      {gruppen.length === 0 && !form && (
        <p className="text-xs text-text-tertiary">{t("gruppen.leer")}</p>
      )}
      <ul className="space-y-1.5">
        {gruppen.map((g) => (
          <li
            key={g.id}
            className={`${KARTE} flex flex-wrap items-start justify-between gap-2 text-sm`}
          >
            <span>
              <b>{g.name}</b> · {t("gruppen.personen", { count: g.anzahl })}
              {g.ich_bin_mitglied && (
                <span className="ml-2 rounded-full bg-ca/10 px-2 py-0.5 text-[10px] text-ca">
                  {t("gruppen.ich")}
                </span>
              )}
              {g.mitglieder && (
                <span className="block text-xs text-text-secondary">
                  {g.mitglieder.map((m) => m.name).join(", ")}
                </span>
              )}
            </span>
            {reise.kann_verwalten && (
              <span className="flex gap-2">
                <button
                  type="button"
                  className="text-xs text-ca underline"
                  onClick={() =>
                    setForm({
                      id: g.id,
                      name: g.name,
                      teilnehmer: (g.mitglieder ?? []).map((m) => m.id),
                    })
                  }
                >
                  {t("gruppen.bearbeiten")}
                </button>
                <button
                  type="button"
                  className="text-xs text-red-600"
                  onClick={() => loeschen.mutate(g.id)}
                >
                  {t("loeschen")}
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {reise.kann_verwalten && vorschlaege.length > 0 && !form && (
        <div className="space-y-1" data-testid="gruppen-vorschlaege">
          <p className="text-[11px] text-text-tertiary">{t("gruppen.vorschlaege")}</p>
          <ul className="space-y-1">
            {vorschlaege.map((v) => (
              <li key={`${v.art}-${v.name}`} className="flex flex-wrap items-center gap-2 text-xs">
                <span>
                  {v.name} ({v.namen.join(", ")})
                </span>
                <button
                  type="button"
                  className={KNOPF_LEISE}
                  onClick={() => setForm({ name: v.name, teilnehmer: v.teilnehmer })}
                >
                  {t("gruppen.uebernehmen")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
