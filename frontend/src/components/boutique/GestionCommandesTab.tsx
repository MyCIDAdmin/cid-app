/**
 * Onglet "Commandes" de la page Admin — Boutique (mockup #pg-admin-boutique, tab-pane
 * btq-cmd) : liste de toutes les commandes (Bureau Admin+ voit tout, voir
 * CommandeViewSet.get_queryset), filtrable par statut, avec changement de statut et
 * annulation. Ne couvre que la première page du cursor (comme les autres pages de gestion de
 * ce module — voir MonAdhesionPage) : limite connue, acceptable pour ce périmètre.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import ConfirmDialog from "../ui/ConfirmDialog";
import {
  useAnnulerCommande,
  useChangerStatutCommande,
  useCommandes,
} from "../../hooks/useBoutique";
import {
  STATUTS_ANNULABLES,
  TRANSITIONS_STATUT_COMMANDE,
  type Commande,
  type StatutCommande,
} from "../../types/boutique";
import { extractApiErrorMessage } from "../../utils/apiError";

const TOUS_STATUTS: StatutCommande[] = [
  "en_attente",
  "confirmee",
  "en_preparation",
  "expediee",
  "livree",
  "annulee",
  "remboursee",
];

const STATUT_STYLES: Record<StatutCommande, string> = {
  en_attente: "bg-status-warningBg text-status-warningText",
  confirmee: "bg-status-successBg text-status-successText",
  en_preparation: "bg-status-warningBg text-status-warningText",
  expediee: "bg-bg-tertiary text-text-secondary",
  livree: "bg-status-successBg text-status-successText",
  annulee: "bg-status-dangerBg text-status-dangerText",
  remboursee: "bg-status-dangerBg text-status-dangerText",
};

function formatMontant(montant: string): string {
  return `${Number(montant).toFixed(2).replace(".", ",")} €`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export default function GestionCommandesTab() {
  const { t } = useTranslation("boutique");
  const [filtreStatut, setFiltreStatut] = useState<StatutCommande | "">("");
  const [commandeAAnnuler, setCommandeAAnnuler] = useState<Commande | null>(null);

  const commandesQuery = useCommandes({ statut: filtreStatut || undefined });
  const changerStatutMutation = useChangerStatutCommande();
  const annulerMutation = useAnnulerCommande();

  function confirmerAnnulation() {
    if (!commandeAAnnuler) return;
    annulerMutation.mutate(commandeAAnnuler.id, { onSuccess: () => setCommandeAAnnuler(null) });
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFiltreStatut("")}
          className={`rounded-cid px-3 py-1.5 text-xs font-medium ${
            filtreStatut === "" ? "bg-ca text-white" : "bg-bg-primary text-text-secondary"
          }`}
        >
          {t("commandes_admin.tous")}
        </button>
        {TOUS_STATUTS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFiltreStatut(s)}
            className={`rounded-cid px-3 py-1.5 text-xs font-medium ${
              filtreStatut === s ? "bg-ca text-white" : "bg-bg-primary text-text-secondary"
            }`}
          >
            {t(`statut_commande.${s}`)}
          </button>
        ))}
      </div>

      {changerStatutMutation.isError && (
        <p className="mb-2 text-xs text-status-dangerText">
          {extractApiErrorMessage(changerStatutMutation.error, t("commandes_admin.erreur_statut"))}
        </p>
      )}

      <div className="overflow-x-auto rounded-cid-lg bg-bg-primary shadow-sm">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-text-tertiary/20 text-left uppercase text-text-tertiary">
              <th className="px-3 py-2">{t("commandes_admin.col_numero")}</th>
              <th className="px-3 py-2">{t("commandes_admin.col_destinataire")}</th>
              <th className="px-3 py-2">{t("commandes_admin.col_montant")}</th>
              <th className="px-3 py-2">{t("commandes_admin.col_statut")}</th>
              <th className="px-3 py-2">{t("commandes_admin.col_date")}</th>
              <th className="px-3 py-2">{t("commandes_admin.col_actions")}</th>
            </tr>
          </thead>
          <tbody>
            {commandesQuery.data?.results.map((commande) => {
              const transitions = TRANSITIONS_STATUT_COMMANDE[commande.statut];
              return (
                <tr key={commande.id} className="border-b border-text-tertiary/10 last:border-0">
                  <td className="px-3 py-2 font-mono">{commande.numero_commande}</td>
                  <td className="px-3 py-2">{commande.nom_destinataire}</td>
                  <td className="px-3 py-2 font-bold text-ca">
                    {formatMontant(commande.montant_total)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUT_STYLES[commande.statut]}`}
                    >
                      {t(`statut_commande.${commande.statut}`)}
                    </span>
                  </td>
                  <td className="px-3 py-2">{formatDate(commande.created_at)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      {transitions.length > 0 && (
                        <select
                          aria-label={t("commandes_admin.changer_statut")}
                          defaultValue=""
                          onChange={(e) => {
                            if (!e.target.value) return;
                            changerStatutMutation.mutate({
                              id: commande.id,
                              payload: { statut: e.target.value as StatutCommande },
                            });
                            e.target.value = "";
                          }}
                          className="rounded-cid border border-text-tertiary/30 px-1.5 py-1 text-[11px]"
                        >
                          <option value="">{t("commandes_admin.changer_statut")}</option>
                          {transitions.map((s) => (
                            <option key={s} value={s}>
                              {t(`statut_commande.${s}`)}
                            </option>
                          ))}
                        </select>
                      )}
                      {STATUTS_ANNULABLES.includes(commande.statut) && (
                        <button
                          type="button"
                          onClick={() => setCommandeAAnnuler(commande)}
                          className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-[11px] text-status-dangerText hover:bg-bg-tertiary"
                        >
                          {t("commandes_admin.annuler")}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {commandesQuery.data && commandesQuery.data.results.length === 0 && (
          <p className="p-4 text-center text-sm text-text-tertiary">
            {t("commandes_admin.aucune_commande")}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={!!commandeAAnnuler}
        title={t("commandes_admin.confirmer_annulation_titre")}
        message={t("commandes_admin.confirmer_annulation_message", {
          numero: commandeAAnnuler?.numero_commande,
        })}
        danger
        onConfirm={confirmerAnnulation}
        onCancel={() => setCommandeAAnnuler(null)}
      />
    </div>
  );
}
