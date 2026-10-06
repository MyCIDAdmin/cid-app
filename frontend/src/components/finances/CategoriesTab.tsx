import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useCategories, useCreerCategorie, useModifierCategorie } from "../../hooks/useFinances";
import { extractApiErrorMessage } from "../../utils/apiError";

export default function CategoriesTab({ modifiable }: { modifiable: boolean }) {
  const { t } = useTranslation("finances");
  const { data, isLoading } = useCategories();
  const creer = useCreerCategorie();
  const modifier = useModifierCategorie();
  const [nom, setNom] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  async function ajouter(e: React.FormEvent) {
    e.preventDefault();
    if (!nom.trim()) return;
    setErreur(null);
    try {
      await creer.mutateAsync(nom.trim());
      setNom("");
    } catch (error) {
      setErreur(extractApiErrorMessage(error, t("erreur")));
    }
  }

  return (
    <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
      <p className="mb-3 text-xs text-text-tertiary">{t("categories.intro")}</p>
      {modifiable && (
        <form onSubmit={ajouter} className="mb-4 flex gap-2">
          <input
            aria-label={t("categories.nouvelle")}
            placeholder={t("categories.nouvelle")}
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            className="w-64 rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
          />
          <button
            type="submit"
            disabled={creer.isPending}
            className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {t("categories.ajouter")}
          </button>
        </form>
      )}
      {erreur && <p className="mb-2 text-xs text-status-dangerText">{erreur}</p>}
      {isLoading ? (
        <p className="text-sm text-text-tertiary">{t("chargement")}</p>
      ) : (
        <ul className="divide-y divide-text-tertiary/10">
          {data?.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2 text-sm">
              <span className={c.actif ? "text-text-primary" : "text-text-tertiary line-through"}>
                {c.nom}
              </span>
              {modifiable && (
                <button
                  type="button"
                  onClick={() => modifier.mutate({ id: c.id, patch: { actif: !c.actif } })}
                  className="text-xs font-medium text-ca hover:underline"
                >
                  {c.actif ? t("categories.desactiver") : t("categories.activer")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
