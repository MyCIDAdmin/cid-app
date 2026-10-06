import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useBudget,
  useBudgetUebersicht,
  useCategories,
  useDefinirBudget,
  useGesamtbudgetSetzen,
} from "../../hooks/useFinances";
import { extractApiErrorMessage } from "../../utils/apiError";
import { kategorieName } from "../../utils/kategorie";

function euro(wert: number | string): string {
  return `${Number(wert).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function Kachel({
  label,
  wert,
  warnung = false,
}: {
  label: string;
  wert: string;
  warnung?: boolean;
}) {
  return (
    <div className="rounded-cid-lg border border-text-tertiary/15 p-3">
      <p
        className={`text-lg font-bold ${warnung ? "text-status-dangerText" : "text-text-primary"}`}
      >
        {wert}
      </p>
      <p className="text-[10px] uppercase text-text-tertiary">{label}</p>
    </div>
  );
}

export default function BudgetTab({ modifiable }: { modifiable: boolean }) {
  const { t, i18n } = useTranslation("finances");
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const categories = useCategories();
  const budget = useBudget(annee);
  const uebersicht = useBudgetUebersicht(annee);
  const definir = useDefinirBudget();
  const gesamtSetzen = useGesamtbudgetSetzen();
  // Saisies en cours, par catégorie ; absent = valeur serveur.
  const [saisies, setSaisies] = useState<Record<string, string>>({});
  const [gesamtSaisie, setGesamtSaisie] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  const montantServeur = (categorieId: string) =>
    budget.data?.find((b) => b.categorie === categorieId)?.montant ?? "";
  const valeur = (categorieId: string) => saisies[categorieId] ?? montantServeur(categorieId);

  const gesamtServeur = Number(uebersicht.data?.gesamt ?? 0);
  // Somme vivante : ce que l'utilisateur est en train de répartir (saisies non enregistrées
  // comprises) — le serveur refuse de toute façon un dépassement.
  const zugeteilt = (categories.data ?? []).reduce(
    (summe, c) => summe + Number(valeur(c.id) || 0),
    0,
  );
  const verfuegbar = gesamtServeur - zugeteilt;
  const ueberschritten = verfuegbar < -0.005;
  const projekte = uebersicht.data?.projekte;

  async function gesamtSpeichern() {
    if (gesamtSaisie === null) return;
    setMessage(null);
    try {
      await gesamtSetzen.mutateAsync({ annee, montant: gesamtSaisie === "" ? "0" : gesamtSaisie });
      setGesamtSaisie(null);
      setMessage({ ok: true, texte: t("budget.gesamt_gespeichert") });
    } catch (error) {
      setMessage({ ok: false, texte: extractApiErrorMessage(error, t("erreur")) });
    }
  }

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
            setGesamtSaisie(null);
          }}
          className="w-24 rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
        />
      </div>

      <section className="mb-4 space-y-3" aria-label={t("budget.gesamt")}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-cid-lg border border-text-tertiary/15 p-3">
            <label
              htmlFor="budget-gesamt"
              className="mb-1 block text-[10px] uppercase text-text-tertiary"
            >
              {t("budget.gesamt")}
            </label>
            <div className="flex items-center gap-2">
              <input
                id="budget-gesamt"
                type="number"
                min="0"
                step="0.01"
                disabled={!modifiable}
                value={gesamtSaisie ?? uebersicht.data?.gesamt ?? ""}
                onChange={(e) => setGesamtSaisie(e.target.value)}
                className="w-32 rounded-cid border border-text-tertiary/30 px-2 py-1 text-right text-sm"
              />
              <button
                type="button"
                onClick={gesamtSpeichern}
                disabled={!modifiable || gesamtSetzen.isPending || gesamtSaisie === null}
                className="rounded-cid bg-ca px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
              >
                {t("budget.gesamt_speichern")}
              </button>
            </div>
          </div>
          <Kachel label={t("budget.zugeteilt")} wert={euro(zugeteilt)} />
          <Kachel label={t("budget.verfuegbar")} wert={euro(verfuegbar)} warnung={ueberschritten} />
        </div>
        {ueberschritten && (
          <p role="alert" className="text-xs text-status-dangerText">
            {t("budget.ueberschritten", { betrag: euro(-verfuegbar) })}
          </p>
        )}
        {gesamtServeur === 0 && (
          <p className="text-xs text-text-tertiary">{t("budget.gesamt_zuerst")}</p>
        )}
      </section>

      <div className="overflow-x-auto">
        <table className="w-full max-w-lg text-sm">
          <tbody>
            {categories.data
              ?.filter((c) => c.actif || Number(montantServeur(c.id)) > 0)
              .map((c) => (
                <tr key={c.id} className="border-b border-text-tertiary/10">
                  <td className="py-1.5 pr-3 text-text-primary">
                    {kategorieName(c.namen, c.nom, i18n.language)}
                    {c.projektbudget && (
                      <span className="ml-2 rounded-full bg-ca/10 px-2 py-0.5 text-[10px] font-medium text-ca">
                        {t("budget.projekttopf")}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 text-right">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      aria-label={kategorieName(c.namen, c.nom, i18n.language)}
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
      </div>

      {projekte && Number(projekte.budget) + Number(projekte.geplant) > 0 && (
        <section className="mt-4 rounded-cid-lg border border-text-tertiary/15 p-3">
          <h3 className="mb-2 text-xs font-bold text-text-primary">{t("budget.projekte_titel")}</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Kachel label={t("budget.projekte_budget")} wert={euro(projekte.budget)} />
            <Kachel label={t("budget.projekte_geplant")} wert={euro(projekte.geplant)} />
            <Kachel
              label={t("budget.projekte_verfuegbar")}
              wert={euro(projekte.verfuegbar)}
              warnung={Number(projekte.verfuegbar) < 0}
            />
          </div>
          <p className="mt-2 text-xs text-text-tertiary">{t("budget.projekte_hinweis")}</p>
        </section>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={enregistrer}
          disabled={
            !modifiable || definir.isPending || Object.keys(saisies).length === 0 || ueberschritten
          }
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
