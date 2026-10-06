import { useState } from "react";
import { useTranslation } from "react-i18next";

import ConfirmDialog from "../ui/ConfirmDialog";
import {
  useApprouverDepense,
  useDepenses,
  useRejeterDepense,
  useSupprimerDepense,
} from "../../hooks/useFinances";
import { useAuthStore } from "../../store/authStore";
import type { Depense, StatutDepense } from "../../types/finances";
import { extractApiErrorMessage } from "../../utils/apiError";
import DepenseFormModal from "./DepenseFormModal";

const CLASSE_STATUT: Record<StatutDepense, string> = {
  en_attente: "bg-status-warningBg text-status-warningText",
  approuvee: "bg-status-successBg text-status-successText",
  rejetee: "bg-status-dangerBg text-status-dangerText",
};

function formatMontant(montant: string): string {
  return `${Number(montant).toFixed(2).replace(".", ",")} €`;
}

export default function DepensesTab({ modifiable }: { modifiable: boolean }) {
  const { t } = useTranslation("finances");
  const userId = useAuthStore((s) => s.user?.id);
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [statut, setStatut] = useState<StatutDepense | "">("");
  const { data, isLoading, isError } = useDepenses({ annee, statut: statut || undefined });
  const approuver = useApprouverDepense();
  const rejeter = useRejeterDepense();
  const supprimer = useSupprimerDepense();

  const [edition, setEdition] = useState<Depense | "nouvelle" | null>(null);
  const [aSupprimer, setASupprimer] = useState<Depense | null>(null);
  const [rejetId, setRejetId] = useState<string | null>(null);
  const [motif, setMotif] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  async function agir(action: () => Promise<unknown>) {
    setErreur(null);
    try {
      await action();
    } catch (error) {
      setErreur(extractApiErrorMessage(error, t("erreur")));
    }
  }

  async function confirmerRejet(id: string) {
    if (!motif.trim()) {
      setErreur(t("motif_requis"));
      return;
    }
    await agir(() => rejeter.mutateAsync({ id, motif: motif.trim() }));
    setRejetId(null);
    setMotif("");
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-cid-lg bg-bg-primary p-3 shadow-sm">
        <div>
          <label
            htmlFor="dep-f-annee"
            className="mb-1 block text-[10px] uppercase text-text-tertiary"
          >
            {t("annee")}
          </label>
          <input
            id="dep-f-annee"
            type="number"
            value={annee}
            onChange={(e) => setAnnee(Number(e.target.value))}
            className="w-24 rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="dep-f-statut"
            className="mb-1 block text-[10px] uppercase text-text-tertiary"
          >
            {t("statut")}
          </label>
          <select
            id="dep-f-statut"
            value={statut}
            onChange={(e) => setStatut(e.target.value as StatutDepense | "")}
            className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
          >
            <option value="">{t("tous")}</option>
            {(["en_attente", "approuvee", "rejetee"] as const).map((s) => (
              <option key={s} value={s}>
                {t(`statuts.${s}`)}
              </option>
            ))}
          </select>
        </div>
        {modifiable && (
          <button
            type="button"
            onClick={() => setEdition("nouvelle")}
            className="ml-auto rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white"
          >
            {t("nouvelle_depense")}
          </button>
        )}
      </div>

      {erreur && <p className="mb-2 text-xs text-status-dangerText">{erreur}</p>}

      <div className="overflow-x-auto rounded-cid-lg bg-bg-primary p-3 shadow-sm">
        {isLoading ? (
          <p className="text-sm text-text-tertiary">{t("chargement")}</p>
        ) : isError || !data ? (
          <p className="text-sm text-status-dangerText">{t("erreur")}</p>
        ) : data.length === 0 ? (
          <p className="text-sm text-text-tertiary">{t("aucune_depense")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase text-text-tertiary">
                {["date", "fournisseur", "categorie", "montant", "bezug", "statut", "aktionen"].map(
                  (c) => (
                    <th key={c} className="px-2 py-1.5">
                      {t(`col.${c}`)}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => {
                const eigene = d.saisie_par === userId;
                return (
                  <tr key={d.id} className="border-t border-text-tertiary/10 align-top">
                    <td className="px-2 py-2 whitespace-nowrap">{d.date_depense}</td>
                    <td className="px-2 py-2">
                      {d.fournisseur}
                      {d.description && (
                        <div className="text-xs text-text-tertiary">{d.description}</div>
                      )}
                      <div className="text-[10px] text-text-tertiary">
                        {t("col.saisie_par")}: {d.saisie_par_nom}
                      </div>
                    </td>
                    <td className="px-2 py-2">{d.categorie_nom}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      {formatMontant(d.montant)}
                    </td>
                    <td className="px-2 py-2 text-xs">
                      {d.evenement_titre ?? d.projet_titre ?? "—"}
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${CLASSE_STATUT[d.statut]}`}
                      >
                        {t(`statuts.${d.statut}`)}
                      </span>
                      {d.statut === "rejetee" && d.motif_rejet && (
                        <div className="mt-1 text-[10px] text-status-dangerText">
                          {d.motif_rejet}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {d.justificatif_url && (
                          <a
                            href={d.justificatif_url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-ca hover:underline"
                          >
                            {t("voir_beleg")}
                          </a>
                        )}
                        {modifiable && d.statut === "en_attente" && !eigene && (
                          <>
                            <button
                              type="button"
                              className="font-medium text-status-successText hover:underline"
                              onClick={() => agir(() => approuver.mutateAsync(d.id))}
                            >
                              {t("approuver")}
                            </button>
                            <button
                              type="button"
                              className="font-medium text-status-dangerText hover:underline"
                              onClick={() => {
                                setRejetId(d.id);
                                setMotif("");
                              }}
                            >
                              {t("rejeter")}
                            </button>
                          </>
                        )}
                        {modifiable && d.statut === "en_attente" && eigene && (
                          <span className="text-[10px] text-text-tertiary">
                            {t("eigene_ausgabe")}
                          </span>
                        )}
                        {modifiable && d.statut !== "approuvee" && (
                          <>
                            <button
                              type="button"
                              className="font-medium text-text-secondary hover:underline"
                              onClick={() => setEdition(d)}
                            >
                              {t("modifier")}
                            </button>
                            <button
                              type="button"
                              className="font-medium text-status-dangerText hover:underline"
                              onClick={() => setASupprimer(d)}
                            >
                              {t("supprimer")}
                            </button>
                          </>
                        )}
                        {d.statut === "approuvee" && (
                          <span className="text-[10px] text-text-tertiary">{t("figee")}</span>
                        )}
                      </div>
                      {rejetId === d.id && (
                        <div className="mt-2 flex gap-2">
                          <input
                            aria-label={t("motif")}
                            placeholder={t("motif")}
                            value={motif}
                            onChange={(e) => setMotif(e.target.value)}
                            className="w-48 rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => confirmerRejet(d.id)}
                            className="rounded-cid bg-status-dangerText px-2 py-1 text-xs text-white"
                          >
                            {t("rejet_confirmer")}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {edition && (
        <DepenseFormModal
          depense={edition === "nouvelle" ? null : edition}
          onClose={() => setEdition(null)}
        />
      )}
      <ConfirmDialog
        open={aSupprimer !== null}
        title={t("supprimer")}
        message={t("supprimer_confirmer")}
        danger
        onConfirm={async () => {
          if (aSupprimer) await agir(() => supprimer.mutateAsync(aSupprimer.id));
          setASupprimer(null);
        }}
        onCancel={() => setASupprimer(null)}
      />
    </div>
  );
}
