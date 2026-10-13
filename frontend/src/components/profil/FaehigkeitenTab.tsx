/**
 * Tab „Fähigkeiten“ unter „Mein Profil“ (Release 9, Wunsch 2026-10-13): „Wo kann ich helfen?“.
 * Das Mitglied wählt Fähigkeiten aus dem gemeinsamen Katalog (nach Kategorien), kann eigene
 * ergänzen (stehen danach allen zur Auswahl) und je Fähigkeit eine kurze Anmerkung notieren.
 * Die Verwaltung (ab RH) sieht die Auswahl im Reporting „Wer kann wo helfen?“.
 */
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  useErstelleFaehigkeit,
  useFaehigkeitenKatalog,
  useMeineFaehigkeiten,
  useSpeichereMeineFaehigkeiten,
} from "../../hooks/useFaehigkeiten";
import {
  FAEHIGKEIT_KATEGORIEN,
  type Faehigkeit,
  type FaehigkeitKategorie,
} from "../../types/faehigkeiten";
import { extractApiErrorMessage } from "../../utils/apiError";
import { useFaehigkeitLabel } from "../../utils/faehigkeitLabel";

const FELD = "rounded-cid border border-text-tertiary/30 bg-bg-primary px-2 py-1.5 text-sm";

export default function FaehigkeitenTab() {
  const { t } = useTranslation("membres");
  const faehigkeitLabel = useFaehigkeitLabel();
  const katalogQuery = useFaehigkeitenKatalog();
  const meineQuery = useMeineFaehigkeiten();
  const speichern = useSpeichereMeineFaehigkeiten();
  const erstellen = useErstelleFaehigkeit();
  const [auswahl, setAuswahl] = useState<Record<string, string>>({});
  const [geladen, setGeladen] = useState(false);
  const [neu, setNeu] = useState("");
  const [neuKategorie, setNeuKategorie] = useState<FaehigkeitKategorie>("weitere");
  const [meldung, setMeldung] = useState<{ art: "ok" | "fehler"; text: string } | null>(null);

  useEffect(() => {
    if (meineQuery.data && !geladen) {
      setAuswahl(Object.fromEntries(meineQuery.data.map((m) => [m.faehigkeit, m.kommentar])));
      setGeladen(true);
    }
  }, [meineQuery.data, geladen]);

  const katalog = katalogQuery.data ?? [];
  const nachId = new Map(katalog.map((f) => [f.id, f]));

  function umschalten(id: string) {
    setMeldung(null);
    setAuswahl((alt) => {
      const kopie = { ...alt };
      if (id in kopie) delete kopie[id];
      else kopie[id] = "";
      return kopie;
    });
  }

  function hinzufuegen(e: FormEvent) {
    e.preventDefault();
    const bezeichnung = neu.trim();
    if (bezeichnung.length < 2) return;
    setMeldung(null);
    erstellen.mutate(
      { bezeichnung, kategorie: neuKategorie },
      {
        onSuccess: (f) => {
          setAuswahl((alt) => (f.id in alt ? alt : { ...alt, [f.id]: "" }));
          setNeu("");
        },
        onError: (err) =>
          setMeldung({
            art: "fehler",
            text: extractApiErrorMessage(err, t("faehigkeiten.fehler")),
          }),
      },
    );
  }

  function speichernKlick() {
    setMeldung(null);
    speichern.mutate(
      Object.entries(auswahl).map(([faehigkeit, kommentar]) => ({ faehigkeit, kommentar })),
      {
        onSuccess: () => setMeldung({ art: "ok", text: t("faehigkeiten.gespeichert") }),
        onError: (err) =>
          setMeldung({
            art: "fehler",
            text: extractApiErrorMessage(err, t("faehigkeiten.fehler")),
          }),
      },
    );
  }

  if (katalogQuery.isLoading || meineQuery.isLoading) {
    return <p className="text-sm text-text-tertiary">{t("faehigkeiten.laden")}</p>;
  }
  if (katalogQuery.isError || meineQuery.isError) {
    return <p className="text-sm text-status-dangerText">{t("faehigkeiten.fehler")}</p>;
  }

  const gewaehlt = Object.keys(auswahl)
    .map((id) => nachId.get(id))
    .filter((f): f is Faehigkeit => Boolean(f));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-text-primary">{t("faehigkeiten.titel")}</h2>
        <p className="mt-1 text-sm text-text-secondary">{t("faehigkeiten.einleitung")}</p>
      </div>

      {FAEHIGKEIT_KATEGORIEN.map((kategorie) => {
        const eintraege = katalog.filter((f) => f.kategorie === kategorie);
        if (eintraege.length === 0) return null;
        return (
          <section key={kategorie} className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
            <h3 className="mb-2 text-xs font-bold uppercase text-text-tertiary">
              {t(`faehigkeiten.kategorie.${kategorie}`)}
            </h3>
            <div className="flex flex-wrap gap-2">
              {eintraege.map((f) => {
                const an = f.id in auswahl;
                return (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={an}
                    onClick={() => umschalten(f.id)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                      an
                        ? "border-ca bg-ca text-white"
                        : "border-text-tertiary/30 text-text-secondary hover:border-ca hover:text-ca"
                    }`}
                  >
                    {an ? "✓ " : ""}
                    {faehigkeitLabel(f.bezeichnung)}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      <form onSubmit={hinzufuegen} className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <h3 className="mb-2 text-xs font-bold uppercase text-text-tertiary">
          {t("faehigkeiten.eigene_titel")}
        </h3>
        <div className="flex flex-wrap gap-2">
          <input
            value={neu}
            onChange={(e) => setNeu(e.target.value)}
            maxLength={80}
            aria-label={t("faehigkeiten.eigene_label")}
            placeholder={t("faehigkeiten.eigene_platzhalter")}
            className={`${FELD} min-w-0 flex-1`}
          />
          <select
            value={neuKategorie}
            onChange={(e) => setNeuKategorie(e.target.value as FaehigkeitKategorie)}
            aria-label={t("faehigkeiten.kategorie_label")}
            className={FELD}
          >
            {FAEHIGKEIT_KATEGORIEN.map((k) => (
              <option key={k} value={k}>
                {t(`faehigkeiten.kategorie.${k}`)}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={erstellen.isPending || neu.trim().length < 2}
            className="rounded-cid border border-ca px-3 py-1.5 text-sm font-medium text-ca hover:bg-ca/10 disabled:opacity-50"
          >
            {t("faehigkeiten.hinzufuegen")}
          </button>
        </div>
      </form>

      {gewaehlt.length > 0 && (
        <section className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
          <h3 className="mb-2 text-xs font-bold uppercase text-text-tertiary">
            {t("faehigkeiten.meine_titel", { anzahl: gewaehlt.length })}
          </h3>
          <ul className="space-y-2">
            {gewaehlt.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-2">
                <span className="w-48 text-sm font-medium text-text-primary">
                  {faehigkeitLabel(f.bezeichnung)}
                </span>
                <input
                  value={auswahl[f.id] ?? ""}
                  onChange={(e) => setAuswahl((alt) => ({ ...alt, [f.id]: e.target.value }))}
                  maxLength={200}
                  aria-label={t("faehigkeiten.anmerkung_fuer", {
                    name: faehigkeitLabel(f.bezeichnung),
                  })}
                  placeholder={t("faehigkeiten.anmerkung_platzhalter")}
                  className={`${FELD} min-w-0 flex-1`}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {meldung && (
        <p
          role={meldung.art === "fehler" ? "alert" : "status"}
          className={`text-sm ${
            meldung.art === "fehler" ? "text-status-dangerText" : "text-status-successText"
          }`}
        >
          {meldung.text}
        </p>
      )}
      <button
        type="button"
        onClick={speichernKlick}
        disabled={speichern.isPending}
        className="rounded-cid bg-ca px-4 py-2 text-sm font-medium text-white hover:bg-cad disabled:opacity-50"
      >
        {t("faehigkeiten.speichern")}
      </button>
    </div>
  );
}
