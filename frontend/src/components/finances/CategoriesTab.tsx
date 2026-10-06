import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useCategories, useCreerCategorie, useModifierCategorie } from "../../hooks/useFinances";
import type { CategorieDepense } from "../../types/finances";
import { extractApiErrorMessage } from "../../utils/apiError";
import { kategorieName } from "../../utils/kategorie";

const CHAMP = "rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm";

interface Namen {
  nom: string;
  nom_de: string;
  nom_ar: string;
}

const LEER: Namen = { nom: "", nom_de: "", nom_ar: "" };

/** Die drei Namensfelder (Französisch = Referenz, Deutsch/Arabisch optional → sonst Französisch). */
function NamenFelder({ werte, onChange }: { werte: Namen; onChange: (n: Namen) => void }) {
  const { t } = useTranslation("finances");
  return (
    <>
      <input
        aria-label={t("categories.nom_fr")}
        placeholder={t("categories.nom_fr")}
        value={werte.nom}
        onChange={(e) => onChange({ ...werte, nom: e.target.value })}
        className={`w-56 ${CHAMP}`}
      />
      <input
        aria-label={t("categories.nom_de")}
        placeholder={t("categories.nom_de")}
        value={werte.nom_de}
        onChange={(e) => onChange({ ...werte, nom_de: e.target.value })}
        className={`w-56 ${CHAMP}`}
      />
      <input
        aria-label={t("categories.nom_ar")}
        placeholder={t("categories.nom_ar")}
        dir="rtl"
        value={werte.nom_ar}
        onChange={(e) => onChange({ ...werte, nom_ar: e.target.value })}
        className={`w-56 ${CHAMP}`}
      />
    </>
  );
}

export default function CategoriesTab({ modifiable }: { modifiable: boolean }) {
  const { t, i18n } = useTranslation("finances");
  const { data, isLoading } = useCategories();
  const creer = useCreerCategorie();
  const modifier = useModifierCategorie();
  const [neu, setNeu] = useState<Namen>(LEER);
  const [bearbeitet, setBearbeitet] = useState<{ id: string; namen: Namen } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function ajouter(e: React.FormEvent) {
    e.preventDefault();
    if (!neu.nom.trim()) return;
    setErreur(null);
    try {
      await creer.mutateAsync({
        nom: neu.nom.trim(),
        nom_de: neu.nom_de.trim(),
        nom_ar: neu.nom_ar.trim(),
      });
      setNeu(LEER);
    } catch (error) {
      setErreur(extractApiErrorMessage(error, t("erreur")));
    }
  }

  async function speichern() {
    if (!bearbeitet || !bearbeitet.namen.nom.trim()) return;
    setErreur(null);
    try {
      await modifier.mutateAsync({
        id: bearbeitet.id,
        patch: {
          nom: bearbeitet.namen.nom.trim(),
          nom_de: bearbeitet.namen.nom_de.trim(),
          nom_ar: bearbeitet.namen.nom_ar.trim(),
        },
      });
      setBearbeitet(null);
    } catch (error) {
      setErreur(extractApiErrorMessage(error, t("erreur")));
    }
  }

  function bearbeiten(c: CategorieDepense) {
    setBearbeitet({ id: c.id, namen: { nom: c.nom, nom_de: c.nom_de, nom_ar: c.nom_ar } });
  }

  return (
    <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
      <p className="mb-3 text-xs text-text-tertiary">{t("categories.intro")}</p>
      {modifiable && (
        <form onSubmit={ajouter} className="mb-4 flex flex-wrap items-center gap-2">
          <NamenFelder werte={neu} onChange={setNeu} />
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
            <li key={c.id} className="py-2 text-sm">
              {bearbeitet?.id === c.id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <NamenFelder
                    werte={bearbeitet.namen}
                    onChange={(namen) => setBearbeitet({ id: c.id, namen })}
                  />
                  <button
                    type="button"
                    onClick={speichern}
                    disabled={modifier.isPending}
                    className="rounded-cid bg-ca px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                  >
                    {t("enregistrer")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBearbeitet(null)}
                    className="text-xs font-medium text-text-secondary hover:underline"
                  >
                    {t("annuler")}
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span
                    className={c.actif ? "text-text-primary" : "text-text-tertiary line-through"}
                  >
                    {kategorieName(c.namen, c.nom, i18n.language)}
                  </span>
                  {modifiable && (
                    <span className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => bearbeiten(c)}
                        className="text-xs font-medium text-ca hover:underline"
                      >
                        {t("categories.uebersetzungen")}
                      </button>
                      <button
                        type="button"
                        onClick={() => modifier.mutate({ id: c.id, patch: { actif: !c.actif } })}
                        className="text-xs font-medium text-ca hover:underline"
                      >
                        {c.actif ? t("categories.desactiver") : t("categories.activer")}
                      </button>
                    </span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
