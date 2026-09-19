/**
 * Page membre "Boutique — Mes commandes" (ajoutée le 2026-09-19).
 *
 * Corrige un lien de notification qui ne pointait vers aucune route existante
 * (apps.boutique.notifications.notifier_commande_confirmee/annulee/expediee utilisaient
 * "/boutique/commandes", sans qu'aucune page ne l'ait jamais servi côté frontend) — voir aussi
 * retour utilisateur "Wenn ich ... auf eine Benachrichtigung klicke ... möchte ich direkt darauf
 * springen".
 *
 * Réutilise `useCommandes()` (déjà scopé côté backend : un rôle < Bureau Admin ne reçoit que ses
 * propres commandes, voir CommandeViewSet.get_queryset — pas de nouveau filtre à dupliquer ici,
 * même principe que GestionCommandesTab qui, lui, sert la vue Bureau Admin+ sur TOUTES les
 * commandes) et `useAnnulerCommande()`, déjà utilisés par la gestion admin — présentation en
 * liste de cartes plutôt qu'en tableau (plus adaptée à un usage membre/mobile que le tableau
 * dense de GestionCommandesTab).
 *
 * `?commande=<id>` (voir useDeepLinkCible) met en évidence la commande visée par une
 * notification.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import ConfirmDialog from "../../components/ui/ConfirmDialog";
import { useAnnulerCommande, useCommandes } from "../../hooks/useBoutique";
import { useDeepLinkCible } from "../../hooks/useDeepLinkCible";
import { STATUTS_ANNULABLES, type Commande, type StatutCommande } from "../../types/boutique";

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

function CommandeCarte({
  commande,
  refCible,
  onAnnuler,
}: {
  commande: Commande;
  refCible: (el: HTMLElement | null) => void;
  onAnnuler: (commande: Commande) => void;
}) {
  const { t } = useTranslation("boutique");
  const nombreArticles = commande.lignes.reduce((total, l) => total + l.quantite, 0);

  return (
    <div ref={refCible} className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-bold text-text-primary">
            {t("mes_commandes.numero_prefixe")} {commande.numero_commande}
          </div>
          <div className="text-xs text-text-tertiary">
            {t("mes_commandes.passee_le", { date: formatDate(commande.created_at) })} ·{" "}
            {t("mes_commandes.articles", { count: nombreArticles })}
          </div>
        </div>
        <span
          className={`inline-block shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUT_STYLES[commande.statut]}`}
        >
          {t(`statut_commande.${commande.statut}`)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-text-tertiary/10 pt-2">
        <span className="text-base font-bold text-ca">
          {formatMontant(commande.montant_total)}
        </span>
        <div className="flex gap-2">
          {commande.numero_suivi && (
            <Link
              to={`/boutique/commande/retour?commande=${commande.id}`}
              className="rounded-cid border border-text-tertiary/30 px-2.5 py-1 text-xs text-text-secondary hover:bg-bg-tertiary"
            >
              {t("mes_commandes.voir_details")}
            </Link>
          )}
          {STATUTS_ANNULABLES.includes(commande.statut) && (
            <button
              type="button"
              onClick={() => onAnnuler(commande)}
              className="rounded-cid border border-text-tertiary/30 px-2.5 py-1 text-xs text-status-dangerText hover:bg-bg-tertiary"
            >
              {t("mes_commandes.annuler")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MesCommandesPage() {
  const { t } = useTranslation("boutique");
  const commandesQuery = useCommandes();
  const annulerMutation = useAnnulerCommande();
  const { refCible } = useDeepLinkCible("commande");
  const [commandeAAnnuler, setCommandeAAnnuler] = useState<Commande | null>(null);

  function confirmerAnnulation() {
    if (!commandeAAnnuler) return;
    annulerMutation.mutate(commandeAAnnuler.id, { onSuccess: () => setCommandeAAnnuler(null) });
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-text-primary">{t("mes_commandes.titre")}</h1>

      {commandesQuery.isLoading && (
        <p className="text-sm text-text-tertiary">{t("mes_commandes.chargement")}</p>
      )}
      {commandesQuery.isError && (
        <p className="text-sm text-status-dangerText">{t("mes_commandes.erreur")}</p>
      )}
      {commandesQuery.data && commandesQuery.data.results.length === 0 && (
        <div className="rounded-cid-lg bg-bg-primary p-8 text-center shadow-sm">
          <p className="mb-3 text-sm text-text-tertiary">{t("mes_commandes.aucune_commande")}</p>
          <Link to="/boutique" className="text-sm font-medium text-ca hover:underline">
            {t("mes_commandes.retour_catalogue")}
          </Link>
        </div>
      )}

      <div className="space-y-3">
        {commandesQuery.data?.results.map((commande) => (
          <CommandeCarte
            key={commande.id}
            commande={commande}
            refCible={refCible(commande.id)}
            onAnnuler={setCommandeAAnnuler}
          />
        ))}
      </div>

      <ConfirmDialog
        open={!!commandeAAnnuler}
        title={t("mes_commandes.confirmer_annulation_titre")}
        message={t("mes_commandes.confirmer_annulation_message", {
          numero: commandeAAnnuler?.numero_commande,
        })}
        danger
        onConfirm={confirmerAnnulation}
        onCancel={() => setCommandeAAnnuler(null)}
      />
    </div>
  );
}
