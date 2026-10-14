import { useState } from "react";
import { useTranslation } from "react-i18next";

import { usePersonenSuche, useVerantwortlichenZuweisen } from "../../hooks/useRegionen";
import { extractApiErrorMessage } from "../../utils/apiError";

export default function PersonZuweisen({ slug }: { slug: string }) {
  const { t } = useTranslation("regionen");
  const [q, setQ] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const suche = usePersonenSuche(q);
  const zuweisen = useVerantwortlichenZuweisen();

  function waehlen(userId: string) {
    setFehler(null);
    zuweisen.mutate(
      { slug, user: userId },
      {
        onSuccess: () => setQ(""),
        onError: (err) => setFehler(extractApiErrorMessage(err, t("fehler_zuweisen"))),
      },
    );
  }

  return (
    <section className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
      <h3 className="mb-1 text-sm font-semibold text-text-primary">{t("zuweisen_titel")}</h3>
      <p className="mb-2 text-xs text-text-tertiary">{t("zuweisen_hinweis")}</p>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label={t("zuweisen_suche")}
        placeholder={t("zuweisen_suche")}
        className="w-full rounded-cid border border-text-tertiary/20 bg-bg-secondary px-3 py-2 text-sm text-text-primary"
      />
      {fehler && <p className="mt-2 text-sm text-status-dangerText">{fehler}</p>}
      {q.trim().length >= 2 && suche.data && suche.data.length === 0 && (
        <p className="mt-2 text-sm text-text-tertiary">{t("zuweisen_keine_treffer")}</p>
      )}
      {suche.data && suche.data.length > 0 && (
        <ul className="mt-2 divide-y divide-text-tertiary/10">
          {suche.data.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0 truncate text-sm text-text-primary">
                {p.name} <span className="text-xs text-text-tertiary">{p.email}</span>
              </span>
              <button
                type="button"
                onClick={() => waehlen(p.id)}
                disabled={zuweisen.isPending}
                className="shrink-0 rounded-cid bg-ca px-3 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
              >
                {t("zuweisen")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
