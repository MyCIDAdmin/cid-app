import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useAnwesenheitSetzen, useTeilnehmer } from "../../hooks/useRegionen";
import { extractApiErrorMessage } from "../../utils/apiError";

/** Teilnehmerliste ; mit Häkchen für die Anwesenheit, sobald das Treffen stattgefunden hat. */
export default function TeilnehmerPanel({
  slug,
  id,
  anwesenheitMoeglich,
}: {
  slug: string;
  id: string;
  anwesenheitMoeglich: boolean;
}) {
  const { t } = useTranslation("regionen");
  const { data, isLoading, isError } = useTeilnehmer(slug, id, true);
  const setzen = useAnwesenheitSetzen();
  const [fehler, setFehler] = useState<string | null>(null);

  if (isLoading) return <p className="text-sm text-text-tertiary">{t("laden")}</p>;
  if (isError || !data) {
    return <p className="text-sm text-status-dangerText">{t("fehler_teilnehmer")}</p>;
  }
  if (data.length === 0) {
    return <p className="text-sm text-text-tertiary">{t("keine_teilnehmer")}</p>;
  }

  return (
    <div className="rounded-cid bg-bg-secondary p-3">
      {anwesenheitMoeglich && (
        <p className="mb-2 text-xs text-text-tertiary">{t("anwesenheit_hinweis")}</p>
      )}
      {fehler && <p className="mb-2 text-sm text-status-dangerText">{fehler}</p>}
      <ul className="flex flex-col gap-1">
        {data.map((p) => (
          <li key={p.user} className="flex items-center gap-2 text-sm text-text-primary">
            {anwesenheitMoeglich ? (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={p.anwesend}
                  disabled={setzen.isPending}
                  onChange={(e) => {
                    setFehler(null);
                    setzen.mutate(
                      { slug, id, user: p.user, anwesend: e.target.checked },
                      {
                        onError: (err) =>
                          setFehler(extractApiErrorMessage(err, t("fehler_speichern"))),
                      },
                    );
                  }}
                />
                {p.name || t("teilnehmer_ohne_name")}
              </label>
            ) : (
              <span>
                {p.name || t("teilnehmer_ohne_name")}
                {p.anwesend && (
                  <span className="ml-2 text-xs text-text-tertiary">✓ {t("anwesend")}</span>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
