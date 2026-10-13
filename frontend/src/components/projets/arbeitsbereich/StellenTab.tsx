/**
 * Tab „Stellen“ im Arbeitsbereich (Release 10): Die Projektleitung (oder Verwaltung) legt offene
 * Stellen an – optional mit einer Fähigkeit aus der Fähigkeiten-Datenbank –, sieht die Meldungen
 * und nimmt an oder lehnt ab. Wer angenommen wird, ist automatisch Teammitglied (Mitarbeit).
 * Bei Stellen mit Fähigkeit werden passende Mitglieder vorgeschlagen.
 */
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { useFaehigkeitenKatalog } from "../../../hooks/useFaehigkeiten";
import {
  useBewerbungEntscheiden,
  useBewerbungen,
  usePassendeMitglieder,
  useStelleAendern,
  useStelleErstellen,
  useStelleLoeschen,
  useStellen,
} from "../../../hooks/useProjets";
import type { ProjetStelle, StatutStelle } from "../../../types/projets";
import { extractApiErrorMessage } from "../../../utils/apiError";
import { useFaehigkeitLabel } from "../../../utils/faehigkeitLabel";

const FELD = "rounded-cid border border-text-tertiary/30 bg-bg-primary px-2 py-1.5 text-sm";

function Bewerbungen({ stelle }: { stelle: ProjetStelle }) {
  const { t } = useTranslation("projets");
  const bewerbungen = useBewerbungen(stelle.id);
  const entscheiden = useBewerbungEntscheiden();
  const liste = bewerbungen.data ?? [];
  if (liste.length === 0) {
    return <p className="text-xs text-text-tertiary">{t("stellen.keine_meldungen")}</p>;
  }
  return (
    <ul className="space-y-1">
      {liste.map((b) => (
        <li
          key={b.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-cid bg-bg-secondary px-2 py-1.5 text-sm"
        >
          <span>
            <span className="font-medium text-text-primary">
              {b.membre_detail ? `${b.membre_detail.prenom} ${b.membre_detail.nom}` : ""}
            </span>
            {b.nachricht && (
              <span className="ml-2 text-xs text-text-secondary">„{b.nachricht}“</span>
            )}
          </span>
          {b.status === "offen" ? (
            <span className="flex gap-2">
              <button
                type="button"
                disabled={entscheiden.isPending || stelle.freie_plaetze === 0}
                onClick={() => entscheiden.mutate({ id: b.id, entscheidung: "annehmen" })}
                className="rounded-cid bg-ca px-2 py-1 text-xs font-medium text-white disabled:opacity-40"
              >
                {t("stellen.annehmen")}
              </button>
              <button
                type="button"
                disabled={entscheiden.isPending}
                onClick={() => entscheiden.mutate({ id: b.id, entscheidung: "ablehnen" })}
                className="rounded-cid border border-text-tertiary/40 px-2 py-1 text-xs text-text-secondary"
              >
                {t("stellen.ablehnen")}
              </button>
            </span>
          ) : (
            <span className="text-xs text-text-tertiary">
              {t(`stellen.status_bewerbung.${b.status}`)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Vorschlaege({ stelle }: { stelle: ProjetStelle }) {
  const { t } = useTranslation("projets");
  const [offen, setOffen] = useState(false);
  const passende = usePassendeMitglieder(stelle.id, offen);
  if (!stelle.faehigkeit) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOffen((o) => !o)}
        aria-expanded={offen}
        className="text-xs font-medium text-ca hover:underline"
      >
        💡 {t("stellen.passende")}
      </button>
      {offen && (
        <ul className="mt-1 space-y-0.5 text-xs text-text-secondary">
          {(passende.data ?? []).length === 0 && !passende.isLoading && (
            <li>{t("stellen.keine_passenden")}</li>
          )}
          {(passende.data ?? []).map((m) => (
            <li key={m.id}>
              <span className="font-medium text-text-primary">{m.nom_complet}</span>
              {m.kommentar && ` – ${m.kommentar}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function StellenTab({
  projetId,
  verwalten,
}: {
  projetId: string;
  verwalten: boolean;
}) {
  const { t } = useTranslation("projets");
  const faehigkeitLabel = useFaehigkeitLabel();
  const stellen = useStellen(projetId);
  const katalog = useFaehigkeitenKatalog();
  const erstellen = useStelleErstellen();
  const aendern = useStelleAendern();
  const loeschen = useStelleLoeschen();
  const [titel, setTitel] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [faehigkeit, setFaehigkeit] = useState("");
  const [anzahl, setAnzahl] = useState(1);
  const [fehler, setFehler] = useState("");

  function anlegen(e: FormEvent) {
    e.preventDefault();
    if (!titel.trim()) return;
    setFehler("");
    erstellen.mutate(
      {
        projet: projetId,
        titel: titel.trim(),
        beschreibung: beschreibung.trim(),
        faehigkeit: faehigkeit || null,
        anzahl,
      },
      {
        onSuccess: () => {
          setTitel("");
          setBeschreibung("");
          setFaehigkeit("");
          setAnzahl(1);
        },
        onError: (err) => setFehler(extractApiErrorMessage(err, t("stellen.fehler"))),
      },
    );
  }

  function setzeStatus(stelle: ProjetStelle, status: StatutStelle) {
    setFehler("");
    aendern.mutate(
      { id: stelle.id, payload: { status } },
      { onError: (err) => setFehler(extractApiErrorMessage(err, t("stellen.fehler"))) },
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-secondary">{t("stellen.tab_einleitung")}</p>
      {!verwalten && <p className="text-xs text-text-tertiary">{t("stellen.nur_lesen")}</p>}

      {verwalten && (
        <form onSubmit={anlegen} className="space-y-2 rounded-cid-lg bg-bg-primary p-3 shadow-sm">
          <h3 className="text-xs font-bold uppercase text-text-tertiary">{t("stellen.neu")}</h3>
          <div className="flex flex-wrap gap-2">
            <input
              value={titel}
              onChange={(e) => setTitel(e.target.value)}
              maxLength={120}
              aria-label={t("stellen.titel_label")}
              placeholder={t("stellen.titel_platzhalter")}
              className={`${FELD} min-w-0 flex-1`}
            />
            <select
              value={faehigkeit}
              onChange={(e) => setFaehigkeit(e.target.value)}
              aria-label={t("stellen.faehigkeit_label")}
              className={FELD}
            >
              <option value="">{t("stellen.ohne_faehigkeit")}</option>
              {(katalog.data ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {faehigkeitLabel(f.bezeichnung)}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              max={50}
              value={anzahl}
              onChange={(e) => setAnzahl(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
              aria-label={t("stellen.anzahl_label")}
              className={`${FELD} w-20`}
            />
          </div>
          <textarea
            value={beschreibung}
            onChange={(e) => setBeschreibung(e.target.value)}
            maxLength={1000}
            rows={2}
            aria-label={t("stellen.beschreibung_label")}
            placeholder={t("stellen.beschreibung_platzhalter")}
            className={`${FELD} w-full`}
          />
          <button
            type="submit"
            disabled={erstellen.isPending || !titel.trim()}
            className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-50"
          >
            {t("stellen.anlegen")}
          </button>
        </form>
      )}
      {fehler && <p className="text-xs text-status-dangerText">{fehler}</p>}

      {(stellen.data ?? []).length === 0 && (
        <p className="text-sm text-text-tertiary">{t("stellen.leer")}</p>
      )}
      <ul className="space-y-2">
        {(stellen.data ?? []).map((s) => (
          <li key={s.id} className="space-y-2 rounded-cid-lg bg-bg-primary p-3 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">{s.titel}</h3>
                <p className="text-xs text-text-tertiary">
                  {t(`stellen.status_stelle.${s.status}`)} ·{" "}
                  {t("stellen.besetzt_von", { angenommen: s.angenommen, anzahl: s.anzahl })}
                  {s.faehigkeit_name ? ` · ${faehigkeitLabel(s.faehigkeit_name)}` : ""}
                </p>
              </div>
              {verwalten && (
                <div className="flex gap-2 text-xs">
                  {s.status === "geschlossen" ? (
                    <button
                      type="button"
                      onClick={() => setzeStatus(s, "offen")}
                      className="text-ca underline"
                    >
                      {t("stellen.wieder_oeffnen")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setzeStatus(s, "geschlossen")}
                      className="text-text-secondary underline"
                    >
                      {t("stellen.schliessen")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(t("stellen.loeschen_bestaetigen", { titel: s.titel }))) {
                        loeschen.mutate(s.id);
                      }
                    }}
                    className="text-status-dangerText underline"
                  >
                    {t("stellen.loeschen")}
                  </button>
                </div>
              )}
            </div>
            {s.beschreibung && (
              <p className="whitespace-pre-line text-sm text-text-secondary">{s.beschreibung}</p>
            )}
            {verwalten && (
              <>
                <Bewerbungen stelle={s} />
                <Vorschlaege stelle={s} />
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
