/** Excel-Exporte für die Organisation : Gesamtübersicht und Namensliste für Dritte. Jeder Abruf
 * wird im Aktivitätsprotokoll festgehalten. */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { exportiere } from "../../api/reisen";
import { useTeilgruppen, useUnterkuenfte } from "../../hooks/useReisen";
import { extractApiErrorMessage } from "../../utils/apiError";
import { declencherTelechargement } from "../../utils/telechargement";
import type { ReiseDetail } from "../../types/reisen";
import { FELD, Fehler, KARTE, KNOPF, KNOPF_LEISE } from "./ui";

export default function ExportKnoepfe({ reise }: { reise: ReiseDetail }) {
  const { t } = useTranslation("reisen");
  const unterkuenfte = useUnterkuenfte(reise.id, true);
  const gruppen = useTeilgruppen(reise.id, true);
  const [filter, setFilter] = useState("");
  const [fehler, setFehler] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  async function laden(art: "excel" | "namensliste") {
    setFehler("");
    setLaeuft(true);
    try {
      const params: { unterkunft?: string; teilgruppe?: string } = {};
      if (art === "namensliste" && filter.startsWith("u:")) params.unterkunft = filter.slice(2);
      if (art === "namensliste" && filter.startsWith("g:")) params.teilgruppe = filter.slice(2);
      const { blob, nomFichier } = await exportiere(reise.id, art, params);
      declencherTelechargement(blob, nomFichier);
    } catch (e) {
      setFehler(extractApiErrorMessage(e, t("fehler.allgemein")));
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <section className={`${KARTE} space-y-2`} aria-label={t("export.titel")}>
      <h2 className="text-sm font-semibold">{t("export.titel")}</h2>
      <p className="text-[11px] text-text-tertiary">{t("export.hinweis")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={KNOPF} disabled={laeuft} onClick={() => laden("excel")}>
          {t("export.excel")}
        </button>
        <select
          className={`${FELD} max-w-[14rem]`}
          aria-label={t("export.filter")}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">{t("export.alle")}</option>
          <option value="u:eigene">{t("export.eigene_unterkunft")}</option>
          {(unterkuenfte.data ?? []).map((u) => (
            <option key={u.id} value={`u:${u.id}`}>
              {u.name}
            </option>
          ))}
          {(gruppen.data?.gruppen ?? []).map((g) => (
            <option key={g.id} value={`g:${g.id}`}>
              {g.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={KNOPF_LEISE}
          disabled={laeuft}
          onClick={() => laden("namensliste")}
        >
          {t("export.namensliste")}
        </button>
      </div>
      <Fehler text={fehler} />
    </section>
  );
}
