/** „Hier wird noch geholfen“ (Release 16) : kommende Dienste mit freien Plätzen, Eintragen per Klick. */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useDienstAktion, useOffeneDienste } from "../../hooks/useKalender";
import { extractApiErrorMessage } from "../../utils/apiError";
import { formatDienstZeit } from "../../utils/kalender";
import Besetzung from "./Besetzung";

export default function OffeneDienste() {
  const { t, i18n } = useTranslation("kalender");
  const offene = useOffeneDienste();
  const aktion = useDienstAktion();
  const [fehler, setFehler] = useState("");
  const liste = offene.data ?? [];
  if (offene.isError || liste.length === 0) return null;

  return (
    <section
      className="rounded-cid-lg border border-status-warningText/30 bg-status-warningBg p-3"
      data-testid="offene-dienste"
    >
      <h2 className="mb-2 text-sm font-semibold text-status-warningText">
        {t("dienste.offen_titel")}
      </h2>
      <ul className="space-y-1">
        {liste.slice(0, 6).map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="min-w-0">
              <span className="font-medium text-text-primary">{d.titel}</span>{" "}
              <Besetzung dienst={d} />
              <span className="block text-xs text-text-secondary">
                {d.termin_titel || d.evenement_titel} · {formatDienstZeit(d, i18n.language)}
              </span>
            </span>
            {d.ich_eingetragen ? (
              <span className="text-xs text-status-successText">
                ✓ {t("dienste.du_bist_eingetragen")}
              </span>
            ) : (
              <button
                type="button"
                className="rounded-cid bg-ca px-2 py-0.5 text-xs font-semibold text-white"
                onClick={() =>
                  aktion
                    .mutateAsync({ id: d.id, aktion: "eintragen" })
                    .then(() => setFehler(""))
                    .catch((e) => setFehler(extractApiErrorMessage(e, t("fehler_aktion"))))
                }
              >
                {t("dienste.eintragen")}
              </button>
            )}
          </li>
        ))}
      </ul>
      {fehler && <p className="mt-2 text-xs text-status-dangerText">{fehler}</p>}
    </section>
  );
}
