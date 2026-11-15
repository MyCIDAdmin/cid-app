/** Kategorien für Hilfegesuche und Angebote pflegen (nur mit dem Recht „Meldungen genehmigen“). */
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  useHilfeKategorieLoeschen,
  useHilfeKategorieSpeichern,
  useHilfeKategorien,
} from "../../hooks/useProjets";
import type { HilfeKategorie } from "../../types/projets";
import { extractApiErrorMessage } from "../../utils/apiError";

const FELD = "w-full rounded-cid border border-text-tertiary/30 bg-bg-primary px-2 py-1.5 text-sm";
const KNOPF = "rounded-cid px-2 py-1 text-xs font-medium disabled:opacity-40";

function Zeile({ kategorie }: { kategorie: HilfeKategorie }) {
  const { t } = useTranslation("projets");
  const speichern = useHilfeKategorieSpeichern();
  const loeschen = useHilfeKategorieLoeschen();
  const [bearbeiten, setBearbeiten] = useState(false);
  const [de, setDe] = useState(kategorie.name_de);
  const [fr, setFr] = useState(kategorie.name_fr);
  const [reihenfolge, setReihenfolge] = useState(String(kategorie.reihenfolge));
  const [fehler, setFehler] = useState("");

  function sichern() {
    setFehler("");
    speichern.mutate(
      {
        id: kategorie.id,
        daten: { name_de: de, name_fr: fr, reihenfolge: Number(reihenfolge) || 0 },
      },
      {
        onSuccess: () => setBearbeiten(false),
        onError: (err) => setFehler(extractApiErrorMessage(err, t("stellen.fehler"))),
      },
    );
  }

  function entfernen() {
    if (window.confirm(t("hilfe.kat.loeschen_bestaetigen", { name: kategorie.name_de }))) {
      loeschen.mutate(kategorie.id);
    }
  }

  return (
    <li
      className="space-y-2 rounded-cid border border-text-tertiary/20 bg-bg-primary p-3"
      data-testid="kategorie-zeile"
    >
      {bearbeiten ? (
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_6rem]">
          <input
            value={de}
            onChange={(e) => setDe(e.target.value)}
            maxLength={80}
            aria-label={t("hilfe.kat.name_de")}
            className={FELD}
          />
          <input
            value={fr}
            onChange={(e) => setFr(e.target.value)}
            maxLength={80}
            aria-label={t("hilfe.kat.name_fr")}
            className={FELD}
          />
          <input
            value={reihenfolge}
            onChange={(e) => setReihenfolge(e.target.value)}
            inputMode="numeric"
            aria-label={t("hilfe.kat.reihenfolge")}
            className={FELD}
          />
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <span
              className={`text-sm font-semibold ${kategorie.aktiv ? "text-text-primary" : "text-text-tertiary line-through"}`}
            >
              {kategorie.name_de}
            </span>
            {kategorie.name_fr && (
              <span className="ml-2 text-xs text-text-tertiary">{kategorie.name_fr}</span>
            )}
            <span className="ml-2 text-[11px] text-text-tertiary">
              {t("hilfe.kat.anzahl", { count: kategorie.anzahl })}
            </span>
          </div>
          {!kategorie.aktiv && (
            <span className="rounded-full bg-bg-secondary px-2 py-0.5 text-[11px] text-text-tertiary">
              {t("hilfe.kat.inaktiv")}
            </span>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {bearbeiten ? (
          <>
            <button
              type="button"
              onClick={sichern}
              disabled={speichern.isPending || !de.trim()}
              className={`${KNOPF} bg-ca text-white hover:bg-cad`}
            >
              {t("hilfe.kat.speichern")}
            </button>
            <button
              type="button"
              onClick={() => setBearbeiten(false)}
              className={`${KNOPF} text-text-secondary`}
            >
              {t("stellen.abbrechen")}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setBearbeiten(true)}
              className={`${KNOPF} text-ca hover:bg-bg-secondary`}
            >
              {t("hilfe.kat.bearbeiten")}
            </button>
            <button
              type="button"
              disabled={speichern.isPending}
              onClick={() =>
                speichern.mutate({ id: kategorie.id, daten: { aktiv: !kategorie.aktiv } })
              }
              className={`${KNOPF} text-text-secondary hover:bg-bg-secondary`}
            >
              {kategorie.aktiv ? t("hilfe.kat.deaktivieren") : t("hilfe.kat.aktivieren")}
            </button>
            <button
              type="button"
              onClick={entfernen}
              className={`${KNOPF} text-status-dangerText hover:bg-bg-secondary`}
            >
              {t("hilfe.kat.loeschen")}
            </button>
          </>
        )}
      </div>
      {fehler && (
        <p role="alert" className="text-xs text-status-dangerText">
          {fehler}
        </p>
      )}
    </li>
  );
}

export default function KategorienVerwaltung() {
  const { t } = useTranslation("projets");
  const kategorien = useHilfeKategorien(true);
  const speichern = useHilfeKategorieSpeichern();
  const [de, setDe] = useState("");
  const [fr, setFr] = useState("");
  const [fehler, setFehler] = useState("");

  function anlegen(e: FormEvent) {
    e.preventDefault();
    if (!de.trim()) return;
    setFehler("");
    const hoechste = Math.max(0, ...(kategorien.data ?? []).map((k) => k.reihenfolge));
    speichern.mutate(
      { daten: { name_de: de.trim(), name_fr: fr.trim(), reihenfolge: hoechste + 10 } },
      {
        onSuccess: () => {
          setDe("");
          setFr("");
        },
        onError: (err) => setFehler(extractApiErrorMessage(err, t("stellen.fehler"))),
      },
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-secondary">{t("hilfe.kat.einleitung")}</p>
      <form
        onSubmit={anlegen}
        className="grid gap-2 rounded-cid-lg bg-bg-primary p-3 shadow-sm sm:grid-cols-[1fr_1fr_auto]"
        aria-label={t("hilfe.kat.neu")}
      >
        <input
          value={de}
          onChange={(e) => setDe(e.target.value)}
          maxLength={80}
          placeholder={t("hilfe.kat.name_de")}
          aria-label={t("hilfe.kat.name_de")}
          className={FELD}
        />
        <input
          value={fr}
          onChange={(e) => setFr(e.target.value)}
          maxLength={80}
          placeholder={t("hilfe.kat.name_fr")}
          aria-label={t("hilfe.kat.name_fr")}
          className={FELD}
        />
        <button
          type="submit"
          disabled={speichern.isPending || !de.trim()}
          className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-50"
        >
          {t("hilfe.kat.hinzufuegen")}
        </button>
        {fehler && (
          <p role="alert" className="text-xs text-status-dangerText sm:col-span-3">
            {fehler}
          </p>
        )}
      </form>
      <ul className="space-y-2">
        {(kategorien.data ?? []).map((k) => (
          <Zeile key={k.id} kategorie={k} />
        ))}
      </ul>
    </div>
  );
}
