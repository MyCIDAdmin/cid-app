/**
 * Onglet "Bons d'achat" de la page Admin — Boutique (demande utilisateur du 2026-09-23) —
 * liste de tous les bons d'achat (Bureau Admin+ voit tout, voir BonAchatViewSet.get_queryset),
 * filtrable par statut, avec confirmation manuelle du paiement (virement/espèces) réservée à
 * PAIEMENT_EXPEDITION_MIN_LEVEL (Directeur Financier+) — même principe/même seuil que la
 * confirmation de paiement d'une Commande (GestionCommandesTab), gaté ici via
 * `hasRoleAtLeast(user, ROLE_LEVELS.dir_financier)` en miroir de BonAchatPermission côté
 * backend. Un paiement en ligne (Stripe/PayPal) confirme le bon automatiquement via webhook —
 * cette action ne concerne que les paiements hors ligne, pas encore confirmés.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useBonsAchat,
  useConfirmerPaiementBonAchat,
} from "../../hooks/useBoutique";
import { hasRoleAtLeast, ROLE_LEVELS, useAuthStore } from "../../store/authStore";
import {
  STATUTS_BON_ACHAT_CONFIRMABLES,
  type ModePaiementCommande,
  type StatutBonAchat,
} from "../../types/boutique";
import { extractApiErrorMessage } from "../../utils/apiError";

const MODES_PAIEMENT: ModePaiementCommande[] = ["virement", "especes"];
const TOUS_STATUTS: StatutBonAchat[] = ["en_attente", "actif", "epuise"];

const STATUT_STYLES: Record<StatutBonAchat, string> = {
  en_attente: "bg-status-warningBg text-status-warningText",
  actif: "bg-status-successBg text-status-successText",
  epuise: "bg-bg-tertiary text-text-secondary",
};

function formatMontant(montant: string): string {
  return `${Number(montant).toFixed(2).replace(".", ",")} €`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export default function GestionBonsAchatTab() {
  const { t } = useTranslation("boutique");
  const user = useAuthStore((s) => s.user);
  const peutConfirmerPaiement = hasRoleAtLeast(user, ROLE_LEVELS.dir_financier);

  const [filtreStatut, setFiltreStatut] = useState<StatutBonAchat | "">("");
  const [modePaiementParBon, setModePaiementParBon] = useState<
    Record<string, ModePaiementCommande>
  >({});

  const bonsAchatQuery = useBonsAchat({ statut: filtreStatut || undefined });
  const confirmerPaiementMutation = useConfirmerPaiementBonAchat();

  function confirmerPaiement(bonId: string) {
    confirmerPaiementMutation.mutate({
      id: bonId,
      payload: { mode_paiement: modePaiementParBon[bonId] ?? "virement" },
    });
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
            {t(`statut_bon_achat.${s}`)}
          </button>
        ))}
      </div>

      {confirmerPaiementMutation.isError && (
        <p className="mb-2 text-xs text-status-dangerText">
          {extractApiErrorMessage(confirmerPaiementMutation.error, t("paiement.erreur"))}
        </p>
      )}

      <div className="overflow-x-auto rounded-cid-lg bg-bg-primary shadow-sm">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-text-tertiary/20 text-left uppercase text-text-tertiary">
              <th className="px-3 py-2">{t("bons_achat_admin.col_code")}</th>
              <th className="px-3 py-2">{t("bons_achat_admin.col_solde")}</th>
              <th className="px-3 py-2">{t("commandes_admin.col_statut")}</th>
              <th className="px-3 py-2">{t("commandes_admin.col_date")}</th>
              <th className="px-3 py-2">{t("commandes_admin.col_actions")}</th>
            </tr>
          </thead>
          <tbody>
            {bonsAchatQuery.data?.results.map((bon) => (
              <tr key={bon.id} className="border-b border-text-tertiary/10 last:border-0">
                <td className="px-3 py-2 font-mono">{bon.code}</td>
                <td className="px-3 py-2 font-bold text-ca">
                  {formatMontant(bon.solde)}
                  {bon.solde !== bon.montant_initial && (
                    <span className="ml-1 font-sans font-normal text-text-tertiary">
                      / {formatMontant(bon.montant_initial)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUT_STYLES[bon.statut]}`}
                  >
                    {t(`statut_bon_achat.${bon.statut}`)}
                  </span>
                </td>
                <td className="px-3 py-2">{formatDate(bon.created_at)}</td>
                <td className="px-3 py-2">
                  {peutConfirmerPaiement && STATUTS_BON_ACHAT_CONFIRMABLES.includes(bon.statut) && (
                    <span className="flex items-center gap-1.5">
                      <select
                        aria-label={t("paiement.mode_label")}
                        value={modePaiementParBon[bon.id] ?? "virement"}
                        onChange={(e) =>
                          setModePaiementParBon((prev) => ({
                            ...prev,
                            [bon.id]: e.target.value as ModePaiementCommande,
                          }))
                        }
                        className="rounded-cid border border-text-tertiary/30 px-1.5 py-1 text-[11px]"
                      >
                        {MODES_PAIEMENT.map((m) => (
                          <option key={m} value={m}>
                            {t(`paiement.mode.${m}`)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => confirmerPaiement(bon.id)}
                        disabled={confirmerPaiementMutation.isPending}
                        className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-[11px] text-status-successText hover:bg-bg-tertiary disabled:opacity-50"
                      >
                        {t("paiement.confirmer")}
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {bonsAchatQuery.data && bonsAchatQuery.data.results.length === 0 && (
          <p className="p-4 text-center text-sm text-text-tertiary">
            {t("bons_achat_admin.aucun_bon")}
          </p>
        )}
      </div>
    </div>
  );
}
