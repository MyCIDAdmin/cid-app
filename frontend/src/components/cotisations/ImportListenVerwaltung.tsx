/**
 * Verwaltung der Dropdown-Werte der Excel-Vorlage „Zahlungen importieren" (Release 5,
 * 2026-10-12): Zahlungsart (mit zugehörigem Buchungsmodus) und Verwendungszweck (Freitext-Wert).
 * Inaktive Werte verschwinden aus der Vorlage, werden beim Import aber weiter erkannt.
 */
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useImportListenwertLoeschen,
  useImportListenwertSpeichern,
  useImportListenwerte,
} from "../../hooks/useCotisations";
import type { ModePaiement } from "../../types/cotisation";
import type { ImportListe, ImportListenWert } from "../../types/zahlungseingang";
import { extractApiErrorMessage } from "../../utils/apiError";

const MODI: ModePaiement[] = ["virement_sepa", "paypal", "especes", "carte"];
const LISTEN: ImportListe[] = ["zahlungsart", "verwendungszweck"];
const FELD = "rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm";

function ListenBlock({ liste, modifiable }: { liste: ImportListe; modifiable: boolean }) {
  const { t } = useTranslation("cotisations");
  const werte = useImportListenwerte(liste);
  const speichern = useImportListenwertSpeichern();
  const loeschen = useImportListenwertLoeschen();
  const [bezeichnung, setBezeichnung] = useState("");
  const [modus, setModus] = useState<ModePaiement>("virement_sepa");
  const [fehler, setFehler] = useState<string | null>(null);

  function melden(error: unknown) {
    setFehler(extractApiErrorMessage(error, t("import_listen.erreur")));
  }

  function hinzufuegen(e: FormEvent) {
    e.preventDefault();
    setFehler(null);
    speichern.mutate(
      {
        payload: {
          liste,
          bezeichnung: bezeichnung.trim(),
          modus: liste === "zahlungsart" ? modus : "",
          reihenfolge: (werte.data?.length ?? 0) + 1,
        },
      },
      { onSuccess: () => setBezeichnung(""), onError: melden },
    );
  }

  function umschalten(w: ImportListenWert) {
    setFehler(null);
    speichern.mutate({ id: w.id, payload: { aktiv: !w.aktiv } }, { onError: melden });
  }

  function entfernen(w: ImportListenWert) {
    setFehler(null);
    loeschen.mutate(w.id, { onError: melden });
  }

  return (
    <section aria-label={t(`import_listen.liste.${liste}`)}>
      <h3 className="mb-2 text-sm font-semibold text-text-primary">
        {t(`import_listen.liste.${liste}`)}
      </h3>
      <ul className="mb-3 space-y-1">
        {werte.data?.map((w) => (
          <li
            key={w.id}
            className="flex flex-wrap items-center gap-2 rounded-cid bg-bg-secondary px-2 py-1 text-sm"
          >
            <span className={w.aktiv ? "" : "text-text-tertiary line-through"}>
              {w.bezeichnung}
            </span>
            {liste === "zahlungsart" && (
              <span className="text-xs text-text-tertiary">
                → {t(`import_listen.modus.${w.modus || "virement_sepa"}`)}
              </span>
            )}
            {modifiable && (
              <span className="ml-auto flex gap-2">
                <button
                  type="button"
                  onClick={() => umschalten(w)}
                  className="text-xs text-ca hover:underline"
                >
                  {w.aktiv ? t("import_listen.deaktivieren") : t("import_listen.aktivieren")}
                </button>
                <button
                  type="button"
                  onClick={() => entfernen(w)}
                  className="text-xs text-status-dangerText hover:underline"
                >
                  {t("import_listen.entfernen")}
                </button>
              </span>
            )}
          </li>
        ))}
        {werte.data?.length === 0 && (
          <li className="text-xs text-text-tertiary">{t("import_listen.leer")}</li>
        )}
      </ul>
      {modifiable && (
        <form onSubmit={hinzufuegen} className="flex flex-wrap items-center gap-2">
          <input
            value={bezeichnung}
            onChange={(e) => setBezeichnung(e.target.value)}
            maxLength={100}
            required
            placeholder={t("import_listen.neuer_wert")}
            aria-label={t(`import_listen.neuer_wert_aria.${liste}`)}
            className={FELD}
          />
          {liste === "zahlungsart" && (
            <select
              value={modus}
              onChange={(e) => setModus(e.target.value as ModePaiement)}
              aria-label={t("import_listen.modus_label")}
              className={FELD}
            >
              {MODI.map((m) => (
                <option key={m} value={m}>
                  {t(`import_listen.modus.${m}`)}
                </option>
              ))}
            </select>
          )}
          <button
            type="submit"
            disabled={speichern.isPending || !bezeichnung.trim()}
            className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-50"
          >
            {t("import_listen.hinzufuegen")}
          </button>
        </form>
      )}
      {fehler && <p className="mt-1 text-xs text-status-dangerText">{fehler}</p>}
    </section>
  );
}

export default function ImportListenVerwaltung({ modifiable }: { modifiable: boolean }) {
  const { t } = useTranslation("cotisations");
  const [offen, setOffen] = useState(false);
  return (
    <div className="mt-4 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
      <button
        type="button"
        onClick={() => setOffen((v) => !v)}
        aria-expanded={offen}
        className="text-sm font-semibold text-ca hover:underline"
      >
        {offen ? t("import_listen.schliessen") : t("import_listen.oeffnen")}
      </button>
      {offen && (
        <div className="mt-3">
          <p className="mb-3 text-xs text-text-secondary">{t("import_listen.hinweis")}</p>
          <div className="grid gap-6 md:grid-cols-2">
            {LISTEN.map((l) => (
              <ListenBlock key={l} liste={l} modifiable={modifiable} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
