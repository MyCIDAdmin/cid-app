/**
 * Page membre "Boutique — Mes bons d'achat" (demande utilisateur du 2026-09-23) — liste des bons
 * d'achat achetés par le membre courant (achat, statut, solde restant, expiration). Même
 * principe IDOR que MesCommandesPage : `useBonsAchat()` est déjà scopé côté backend (un rôle
 * < Bureau Admin ne reçoit que ses propres bons, voir BonAchatViewSet.get_queryset).
 *
 * `?bon=<id>` (voir useDeepLinkCible) met en évidence le bon visé par une notification
 * ("Votre bon d'achat est prêt", apps.boutique.notifications.notifier_bon_achat_actif).
 */
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useBonsAchat } from "../../hooks/useBoutique";
import { useDeepLinkCible } from "../../hooks/useDeepLinkCible";
import type { BonAchat, StatutBonAchat } from "../../types/boutique";

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

function BonAchatCarte({
  bon,
  refCible,
}: {
  bon: BonAchat;
  refCible: (el: HTMLElement | null) => void;
}) {
  const { t } = useTranslation("boutique");

  return (
    <div ref={refCible} className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-mono text-sm font-bold text-text-primary">{bon.code}</div>
          <div className="text-xs text-text-tertiary">
            {t("mes_bons_achat.achete_le", { date: formatDate(bon.created_at) })}
          </div>
        </div>
        <span
          className={`inline-block shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUT_STYLES[bon.statut]}`}
        >
          {t(`statut_bon_achat.${bon.statut}`)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-text-tertiary/10 pt-2">
        <div>
          <span className="text-base font-bold text-ca">{formatMontant(bon.solde)}</span>
          {bon.solde !== bon.montant_initial && (
            <span className="ml-1.5 text-xs text-text-tertiary">
              {t("mes_bons_achat.sur_montant_initial", {
                montant: formatMontant(bon.montant_initial),
              })}
            </span>
          )}
        </div>
        {bon.date_expiration && (
          <span className="text-[11px] text-text-tertiary">
            {t("mes_bons_achat.expire_le", { date: formatDate(bon.date_expiration) })}
          </span>
        )}
      </div>
    </div>
  );
}

export default function MesBonsAchatPage() {
  const { t } = useTranslation("boutique");
  const bonsAchatQuery = useBonsAchat();
  const { refCible } = useDeepLinkCible("bon");

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-text-primary">{t("mes_bons_achat.titre")}</h1>
        <Link
          to="/boutique/bon-achat/acheter"
          className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad"
        >
          {t("mes_bons_achat.acheter_lien")}
        </Link>
      </div>

      {bonsAchatQuery.isLoading && (
        <p className="text-sm text-text-tertiary">{t("mes_bons_achat.chargement")}</p>
      )}
      {bonsAchatQuery.isError && (
        <p className="text-sm text-status-dangerText">{t("mes_bons_achat.erreur")}</p>
      )}
      {bonsAchatQuery.data && bonsAchatQuery.data.results.length === 0 && (
        <div className="rounded-cid-lg bg-bg-primary p-8 text-center shadow-sm">
          <p className="mb-3 text-sm text-text-tertiary">{t("mes_bons_achat.aucun_bon")}</p>
          <Link
            to="/boutique/bon-achat/acheter"
            className="text-sm font-medium text-ca hover:underline"
          >
            {t("mes_bons_achat.acheter_lien")}
          </Link>
        </div>
      )}

      <div className="space-y-3">
        {bonsAchatQuery.data?.results.map((bon) => (
          <BonAchatCarte key={bon.id} bon={bon} refCible={refCible(bon.id)} />
        ))}
      </div>
    </div>
  );
}
