/**
 * Assistent für die beiden Excel-Importe (Mitglieder-Stammdaten und Statushistorie), 2026-10-08.
 * Drei Schritte, zustandslos gegenüber dem Server (die Datei wird bei „Bestätigen" erneut gesendet):
 *   1. Datei wählen -> „Prüfen" (POST …/pruefen/, es wird NICHTS geschrieben)
 *   2. Prüfliste: neue Zeilen, Dubletten (einzeln zum Überschreiben wählbar), unverändert, Fehler
 *   3. „Import bestätigen" (POST …/bestaetigen/) -> Ergebnis + Excel-Bericht mit „Status"/„Grund"
 */
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  telechargerTemplateImportHistorique,
  telechargerTemplateImportMembres,
} from "../../api/membres";
import { useBestaetigenImport, usePruefenImport } from "../../hooks/useMembres";
import type {
  ImportArt,
  ImportErgebnis,
  ImportErgebnisArt,
  ImportPruefung,
  ImportPruefZeile,
  ImportZeilenStatus,
} from "../../types/membre";
import { extractApiErrorMessage } from "../../utils/apiError";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Déclenche le téléchargement d'un blob avec le nom de fichier donné. */
function declencherTelechargement(blob: Blob, nomFichier: string) {
  const url = window.URL.createObjectURL(blob);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = nomFichier;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  window.URL.revokeObjectURL(url);
}

function base64ZuBlob(base64: string): Blob {
  const binaer = window.atob(base64);
  const bytes = new Uint8Array(binaer.length);
  for (let i = 0; i < binaer.length; i += 1) bytes[i] = binaer.charCodeAt(i);
  return new Blob([bytes], { type: XLSX_MIME });
}

const STATUS_REIHENFOLGE: ImportZeilenStatus[] = ["neu", "dublette", "unveraendert", "fehler"];

const STATUS_STIL: Record<ImportZeilenStatus, string> = {
  neu: "bg-status-successBg text-status-successText",
  dublette: "bg-status-warningBg text-status-warningText",
  unveraendert: "bg-bg-secondary text-text-secondary",
  fehler: "bg-status-dangerBg text-status-dangerText",
};

const ERGEBNIS_REIHENFOLGE: ImportErgebnisArt[] = [
  "importiert",
  "ueberschrieben",
  "teilweise",
  "uebersprungen",
  "unveraendert",
  "fehler",
];

const ERGEBNIS_STIL: Record<ImportErgebnisArt, string> = {
  importiert: "text-status-successText",
  ueberschrieben: "text-text-primary",
  teilweise: "text-status-warningText",
  uebersprungen: "text-status-warningText",
  unveraendert: "text-text-secondary",
  fehler: "text-status-dangerText",
};

const BUTTON_PRIMAER =
  "rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-40";
const BUTTON_SEKUNDAER =
  "rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-bg-secondary disabled:opacity-40";

function PruefZeileKopf({ zeile }: { zeile: ImportPruefZeile }) {
  const name = [zeile.anzeige.prenom, zeile.anzeige.nom].filter(Boolean).join(" ");
  return (
    <>
      <div className="font-medium text-text-primary">{name || "—"}</div>
      <div className="text-xs text-text-secondary">{zeile.anzeige.email}</div>
    </>
  );
}

interface PruefungAnsichtProps {
  art: ImportArt;
  pruefung: ImportPruefung;
  auswahl: Set<number>;
  onAuswahl: (auswahl: Set<number>) => void;
  onBestaetigen: () => void;
  onAbbrechen: () => void;
  laeuft: boolean;
  fehler: string | null;
}

function PruefungAnsicht({
  art,
  pruefung,
  auswahl,
  onAuswahl,
  onBestaetigen,
  onAbbrechen,
  laeuft,
  fehler,
}: PruefungAnsichtProps) {
  const { t } = useTranslation("membres");
  const [filter, setFilter] = useState<ImportZeilenStatus | "alle">("alle");

  const ueberschreibbare = pruefung.zeilen.filter((z) => z.ueberschreibbar);
  const sichtbar =
    filter === "alle" ? pruefung.zeilen : pruefung.zeilen.filter((z) => z.status === filter);

  function umschalten(ligne: number) {
    const neu = new Set(auswahl);
    if (neu.has(ligne)) neu.delete(ligne);
    else neu.add(ligne);
    onAuswahl(neu);
  }

  return (
    <section className="mt-4 rounded-cid-lg bg-bg-primary p-5 shadow-sm">
      <h2 className="mb-1 text-sm font-semibold text-text-primary">{t("import_pruefung.titre")}</h2>
      <p className="mb-4 text-sm text-text-secondary">{t(`import_pruefung.hinweis_${art}`)}</p>

      <div
        className="mb-4 flex flex-wrap gap-2"
        role="group"
        aria-label={t("import_pruefung.filter")}
      >
        <button
          type="button"
          onClick={() => setFilter("alle")}
          aria-pressed={filter === "alle"}
          className={`${BUTTON_SEKUNDAER} ${filter === "alle" ? "ring-2 ring-ca" : ""}`}
        >
          {t("import_pruefung.filter_alle")} ({pruefung.total})
        </button>
        {STATUS_REIHENFOLGE.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setFilter(status)}
            aria-pressed={filter === status}
            className={`${BUTTON_SEKUNDAER} ${filter === status ? "ring-2 ring-ca" : ""}`}
          >
            {t(`import_pruefung.status.${status}`)} ({pruefung.zaehler[status]})
          </button>
        ))}
      </div>

      {ueberschreibbare.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => onAuswahl(new Set(ueberschreibbare.map((z) => z.ligne)))}
            className={BUTTON_SEKUNDAER}
          >
            {t("import_pruefung.alle_waehlen")}
          </button>
          <button
            type="button"
            onClick={() => onAuswahl(new Set())}
            disabled={auswahl.size === 0}
            className={BUTTON_SEKUNDAER}
          >
            {t("import_pruefung.auswahl_aufheben")}
          </button>
          <span className="text-text-secondary">
            {t("import_pruefung.ausgewaehlt")}: {auswahl.size} / {ueberschreibbare.length}
          </span>
        </div>
      )}

      {pruefung.zeilen.length === 0 ? (
        <p className="text-sm text-text-secondary">{t("import_pruefung.keine_zeilen")}</p>
      ) : (
        <div className="max-h-[32rem] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-bg-primary">
              <tr className="border-b border-text-tertiary/20 text-left text-xs font-semibold uppercase text-text-tertiary">
                <th className="px-2 py-1" scope="col">
                  {t("import_pruefung.col_ueberschreiben")}
                </th>
                <th className="px-2 py-1" scope="col">
                  {t("import_pruefung.col_zeile")}
                </th>
                <th className="px-2 py-1" scope="col">
                  {t("import_pruefung.col_status")}
                </th>
                <th className="px-2 py-1" scope="col">
                  {t("import_pruefung.col_person")}
                </th>
                <th className="px-2 py-1" scope="col">
                  {t("import_pruefung.col_details")}
                </th>
              </tr>
            </thead>
            <tbody>
              {sichtbar.map((zeile) => (
                <tr
                  key={zeile.ligne}
                  className="border-b border-text-tertiary/10 align-top last:border-0"
                >
                  <td className="px-2 py-2">
                    {zeile.ueberschreibbar ? (
                      <input
                        type="checkbox"
                        checked={auswahl.has(zeile.ligne)}
                        onChange={() => umschalten(zeile.ligne)}
                        aria-label={`${t("import_pruefung.ueberschreiben_zeile")} ${zeile.ligne}`}
                      />
                    ) : null}
                  </td>
                  <td className="px-2 py-2">{zeile.ligne}</td>
                  <td className="px-2 py-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STIL[zeile.status]}`}
                    >
                      {t(`import_pruefung.status.${zeile.status}`)}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <PruefZeileKopf zeile={zeile} />
                  </td>
                  <td className="px-2 py-2">
                    <div className="text-text-secondary">{zeile.grund}</div>
                    {zeile.aenderungen.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-xs">
                        {zeile.aenderungen.map((aenderung) => (
                          <li key={aenderung.champ}>
                            <span className="font-medium text-text-primary">
                              {aenderung.label}:
                            </span>{" "}
                            <span className="text-text-tertiary line-through">
                              {aenderung.alt || t("import_pruefung.leer")}
                            </span>{" "}
                            → <span className="text-text-primary">{aenderung.neu}</span>
                            {aenderung.art === "neu" && (
                              <span className="ml-1 text-status-successText">
                                ({t("import_pruefung.neu_hinweis")})
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={onBestaetigen} disabled={laeuft} className={BUTTON_PRIMAER}>
          {laeuft ? t("import_pruefung.bestaetigen_laeuft") : t("import_pruefung.bestaetigen")}
        </button>
        <button type="button" onClick={onAbbrechen} disabled={laeuft} className={BUTTON_SEKUNDAER}>
          {t("import_pruefung.abbrechen")}
        </button>
        <span className="text-sm text-text-secondary">
          {t("import_pruefung.zusammenfassung", {
            neu: pruefung.zaehler.neu,
            ueberschreiben: auswahl.size,
          })}
        </span>
      </div>
      {fehler && <p className="mt-2 text-sm text-status-dangerText">{fehler}</p>}
    </section>
  );
}

function ErgebnisAnsicht({ ergebnis, onNeu }: { ergebnis: ImportErgebnis; onNeu: () => void }) {
  const { t } = useTranslation("membres");
  const [bericht, setBericht] = useState<string | null>(null);

  function berichtHerunterladen() {
    try {
      declencherTelechargement(
        base64ZuBlob(ergebnis.bericht.inhalt_base64),
        ergebnis.bericht.dateiname,
      );
      setBericht(null);
    } catch {
      setBericht(t("import_pruefung.bericht_fehler"));
    }
  }

  return (
    <section className="mt-4 rounded-cid-lg bg-bg-primary p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-text-primary">
        {t("import_pruefung.ergebnis_titre")}
      </h2>
      <dl className="mb-4 grid grid-cols-2 gap-4 text-center sm:grid-cols-4 lg:grid-cols-7">
        <div>
          <dt className="text-xs uppercase text-text-tertiary">{t("import_pruefung.gelesen")}</dt>
          <dd className="text-lg font-semibold text-text-primary">{ergebnis.total}</dd>
        </div>
        {ERGEBNIS_REIHENFOLGE.map((art) => (
          <div key={art}>
            <dt className="text-xs uppercase text-text-tertiary">
              {t(`import_pruefung.ergebnis.${art}`)}
            </dt>
            <dd className={`text-lg font-semibold ${ERGEBNIS_STIL[art]}`}>
              {ergebnis.zaehler[art] ?? 0}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={berichtHerunterladen} className={BUTTON_PRIMAER}>
          {t("import_pruefung.bericht_herunterladen")}
        </button>
        <button type="button" onClick={onNeu} className={BUTTON_SEKUNDAER}>
          {t("import_pruefung.neuer_import")}
        </button>
      </div>
      {bericht && <p className="mb-2 text-sm text-status-dangerText">{bericht}</p>}

      <div className="max-h-[24rem] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-bg-primary">
            <tr className="border-b border-text-tertiary/20 text-left text-xs font-semibold uppercase text-text-tertiary">
              <th className="px-2 py-1" scope="col">
                {t("import_pruefung.col_zeile")}
              </th>
              <th className="px-2 py-1" scope="col">
                {t("import_pruefung.col_status")}
              </th>
              <th className="px-2 py-1" scope="col">
                {t("import_pruefung.col_grund")}
              </th>
            </tr>
          </thead>
          <tbody>
            {ergebnis.zeilen.map((zeile) => (
              <tr key={zeile.ligne} className="border-b border-text-tertiary/10 last:border-0">
                <td className="px-2 py-1">{zeile.ligne}</td>
                <td className={`px-2 py-1 font-medium ${ERGEBNIS_STIL[zeile.ergebnis]}`}>
                  {t(`import_pruefung.ergebnis.${zeile.ergebnis}`)}
                </td>
                <td className="px-2 py-1 text-text-secondary">{zeile.grund}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function ImportAssistent({ art }: { art: ImportArt }) {
  const { t } = useTranslation("membres");
  // Beschriftungen der Vorlage/Datei-Karte liegen weiterhin in den Namespaces import / import_historique.
  const ns = art === "membres" ? "import" : "import_historique";
  const dateiRef = useRef<HTMLInputElement>(null);

  const [datei, setDatei] = useState<File | null>(null);
  const [lokalerFehler, setLokalerFehler] = useState<string | null>(null);
  const [vorlageLaeuft, setVorlageLaeuft] = useState(false);
  const [vorlageFehler, setVorlageFehler] = useState<string | null>(null);
  const [auswahl, setAuswahl] = useState<Set<number>>(new Set());

  const pruefenMutation = usePruefenImport(art);
  const bestaetigenMutation = useBestaetigenImport(art);

  const pruefung = pruefenMutation.data;
  const ergebnis = bestaetigenMutation.data;

  async function vorlageLaden() {
    setVorlageFehler(null);
    setVorlageLaeuft(true);
    try {
      const blob =
        art === "membres"
          ? await telechargerTemplateImportMembres()
          : await telechargerTemplateImportHistorique();
      declencherTelechargement(
        blob,
        art === "membres" ? "template_import_membres.xlsx" : "template_import_historique.xlsx",
      );
    } catch (error) {
      setVorlageFehler(extractApiErrorMessage(error, t(`${ns}.erreur_template`)));
    } finally {
      setVorlageLaeuft(false);
    }
  }

  function zuruecksetzen() {
    pruefenMutation.reset();
    bestaetigenMutation.reset();
    setDatei(null);
    setAuswahl(new Set());
    setLokalerFehler(null);
    if (dateiRef.current) dateiRef.current.value = "";
  }

  function onPruefen(e: React.FormEvent) {
    e.preventDefault();
    if (!datei) {
      setLokalerFehler(t(`${ns}.aucun_fichier`));
      return;
    }
    setLokalerFehler(null);
    bestaetigenMutation.reset();
    setAuswahl(new Set());
    pruefenMutation.mutate(datei);
  }

  function onBestaetigen() {
    if (!datei) return;
    bestaetigenMutation.mutate({
      fichier: datei,
      ueberschreiben: [...auswahl].sort((a, b) => a - b),
    });
  }

  const inPruefung = pruefung !== undefined && ergebnis === undefined;

  return (
    <div>
      {ergebnis === undefined && (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-cid-lg bg-bg-primary p-5 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-text-primary">
              {t(`${ns}.template_titre`)}
            </h2>
            <p className="mb-3 text-sm text-text-secondary">{t(`${ns}.template_description`)}</p>
            <button
              type="button"
              onClick={vorlageLaden}
              disabled={vorlageLaeuft}
              className={BUTTON_PRIMAER}
            >
              {t(`${ns}.template_bouton`)}
            </button>
            {vorlageFehler && (
              <p className="mt-2 text-sm text-status-dangerText">{vorlageFehler}</p>
            )}
          </section>

          <section className="rounded-cid-lg bg-bg-primary p-5 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-text-primary">
              {t(`${ns}.upload_titre`)}
            </h2>
            <form onSubmit={onPruefen} className="space-y-3">
              <div>
                <label
                  htmlFor={`fichier-${art}`}
                  className="mb-1 block text-xs font-medium text-text-secondary"
                >
                  {t(`${ns}.choisir_fichier`)}
                </label>
                <input
                  id={`fichier-${art}`}
                  ref={dateiRef}
                  type="file"
                  accept=".xlsx"
                  disabled={inPruefung}
                  onChange={(e) => {
                    setDatei(e.target.files?.[0] ?? null);
                    setLokalerFehler(null);
                    pruefenMutation.reset();
                    setAuswahl(new Set());
                  }}
                  className="block w-full text-sm text-text-secondary"
                />
                {lokalerFehler && (
                  <p className="mt-1 text-xs text-status-dangerText">{lokalerFehler}</p>
                )}
              </div>
              <button
                type="submit"
                disabled={pruefenMutation.isPending || inPruefung}
                className={BUTTON_PRIMAER}
              >
                {pruefenMutation.isPending
                  ? t("import_pruefung.pruefen_laeuft")
                  : t("import_pruefung.pruefen")}
              </button>
              {pruefenMutation.isError && (
                <p className="text-sm text-status-dangerText">
                  {extractApiErrorMessage(pruefenMutation.error, t(`${ns}.erreur_import`))}
                </p>
              )}
            </form>
          </section>
        </div>
      )}

      {inPruefung && pruefung && (
        <PruefungAnsicht
          art={art}
          pruefung={pruefung}
          auswahl={auswahl}
          onAuswahl={setAuswahl}
          onBestaetigen={onBestaetigen}
          onAbbrechen={zuruecksetzen}
          laeuft={bestaetigenMutation.isPending}
          fehler={
            bestaetigenMutation.isError
              ? extractApiErrorMessage(bestaetigenMutation.error, t(`${ns}.erreur_import`))
              : null
          }
        />
      )}

      {ergebnis && <ErgebnisAnsicht ergebnis={ergebnis} onNeu={zuruecksetzen} />}
    </div>
  );
}
