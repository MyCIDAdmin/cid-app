import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useBudget, useCategories, useDefinirBudget } from "../../hooks/useFinances";
import { extractApiErrorMessage } from "../../utils/apiError";

export default function BudgetTab({ modifiable }: { modifiable: boolean }) {
  const { t } = useTranslation("finances");
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const categories = useCategories();
  const budget = useBudget(annee);
  const definir = useDefinirBudget();
  // Saisies en cours, par catégorie ; absent = valeur serveur.
  const [saisies, setSaisies] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  const montantServeur = (categorieId: string) =>
    budget.data?.find((b) => b.categorie === categorieId)?.montant ?? "";
  const valeur = (categorieId: string) => saisies[categorieId] ?? montantServeur(categorieId);

  async function enregistrer() {
    setMessage(null);
    const lignes = (categories.data ?? [])
      .filter((c) => c.id in saisies)
      .map((c) => ({ categorie: c.id, montant: saisies[c.id] === "" ? "0" : saisies[c.id] }));
    try {
      await definir.mutateAsync({ annee, lignes });
      setSaisies({});
      setMessage({ ok: true, texte: t("budget.enregistre") });
    } catch (error) {
      setMessage({ ok: false, texte: extractApiErrorMessage(error, t("erreur")) });
    }
  }

  return (
    <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
      <p className="mb-3 text-xs text-text-tertiary">{t("budget.intro")}</p>
      <div className="mb-3">
        <label
          htmlFor="budget-annee"
          className="mb-1 block text-[10px] uppercase text-text-tertiary"
        >
          {t("annee")}
        </label>
        <input
          id="budget-annee"
          type="number"
          value={annee}
          onChange={(e) => {
            setAnnee(Number(e.target.value));
            setSaisies({});
          }}
          className="w-24 rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
        />
      </div>
      <table className="w-full max-w-lg text-sm">
        <tbody>
          {categories.data
            ?.filter((c) => c.actif || Number(montantServeur(c.id)) > 0)
            .map((c) => (
              <tr key={c.id} className="border-b border-text-tertiary/10">
                <td className="py-1.5 pr-3 text-text-primary">{c.nom}</td>
                <td className="py-1.5 text-right">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    aria-label={c.nom}
                    disabled={!modifiable}
                    value={valeur(c.id)}
                    onChange={(e) => setSaisies((s) => ({ ...s, [c.id]: e.target.value }))}
                    className="w-32 rounded-cid border border-text-tertiary/30 px-2 py-1 text-right text-sm"
                  />
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={enregistrer}
          disabled={!modifiable || definir.isPending || Object.keys(saisies).length === 0}
          className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {t("budget.enregistrer")}
        </button>
        {message && (
          <span
            className={`text-xs ${message.ok ? "text-status-successText" : "text-status-dangerText"}`}
          >
            {message.texte}
          </span>
        )}
      </div>
    </div>
  );
}
