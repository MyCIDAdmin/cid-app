/**
 * Onglet "Bons d'achat" de la page Admin — Boutique — liste de tous les bons d'achat (Bureau
 * Admin+ voit tout, voir BonAchatViewSet.get_queryset), filtrable par statut.
 *
 * Purement en lecture seule depuis le 2026-09-23 (demande utilisateur : "Gutschein wird ein
 * echtes Produkt im Katalog") : un bon d'achat n'est plus acheté/confirmé via un flux dédié —
 * il naît déjà `actif`, généré automatiquement dès que la commande qui l'a acheté (un produit
 * "bon_achat" du catalogue comme un autre) est elle-même confirmée par les mêmes moyens que
 * n'importe quelle autre commande (paiement en ligne, virement/espèces confirmés via
 * GestionCommandesTab, ou couverte par un autre bon d'achat). Il n'y a donc plus d'action de
 * confirmation de paiement propre à un bon (BonAchatViewSet ne sert plus que list/retrieve +
 * `verifier` côté backend) — cet onglet ne sert plus qu'à la supervision/l'oversight.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useBonsAchat } from "../../hooks/useBoutique";
import type { StatutBonAchat } from "../../types/boutique";

const TOUS_STATUTS: StatutBonAchat[] = ["actif", "epuise"];

const STATUT_STYLES: Record<StatutBonAchat, string> = {
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

  const [filtreStatut, setFiltreStatut] = useState<StatutBonAchat | "">("");

  const bonsAchatQuery = useBonsAchat({ statut: filtreStatut || undefined });

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

      <div className="overflow-x-auto rounded-cid-lg bg-bg-primary shadow-sm">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-text-tertiary/20 text-left uppercase text-text-tertiary">
              <th className="px-3 py-2">{t("bons_achat_admin.col_code")}</th>
              <th className="px-3 py-2">{t("bons_achat_admin.col_solde")}</th>
              <th className="px-3 py-2">{t("commandes_admin.col_statut")}</th>
              <th className="px-3 py-2">{t("commandes_admin.col_date")}</th>
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
