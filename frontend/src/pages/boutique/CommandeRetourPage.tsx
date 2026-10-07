/**
 * Page de retour après paiement en ligne d'une commande boutique (ajoutée le 2026-09-17, même
 * principe que CotisationRetourPage/AHM-46) — cible de `success_url`/`cancel_url` (Stripe) et
 * `return_url`/`cancel_url` (PayPal), voir apps.cotisations.gateways (partagé avec
 * apps.boutique). `?commande=<id>` identifie la commande ; `?annule=1` indique que le membre a
 * annulé sur la page du PSP avant de finaliser.
 *
 * Le webhook (apps.boutique.webhooks) est asynchrone : au moment où ce navigateur revient ici, la
 * confirmation serveur (statut=confirmee) peut ne pas être encore arrivée. Cette page affiche donc
 * le statut réel de la commande (jamais déduit de l'URL de retour elle-même) et propose un bouton
 * "vérifier à nouveau" plutôt qu'un polling automatique — même choix que côté cotisations.
 *
 * Contrairement à Cotisation, Commande n'a pas de statut "échouée" (voir apps.boutique.models) :
 * une session/commande PSP expirée ou refusée laisse simplement la commande "en_attente", d'où
 * l'absence ici d'un état "échouée" dédié — le cas se confond avec l'attente/l'annulation.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";

import { useCommande, useInitierPaiementEnLigneCommande } from "../../hooks/useBoutique";
import type { PasserelleCommande } from "../../types/boutique";
import { extractApiErrorMessage } from "../../utils/apiError";
import { leiteZuZahlungWeiter } from "../../utils/sicherUrl";

function formatMontant(montant: number): string {
  return `${montant.toFixed(2).replace(".", ",")} €`;
}

export default function CommandeRetourPage() {
  const { t } = useTranslation("boutique");
  const [searchParams] = useSearchParams();
  const commandeId = searchParams.get("commande") ?? undefined;
  const annule = searchParams.get("annule") === "1";

  const { data: commande, isLoading, isError, isFetching, refetch } = useCommande(commandeId);
  const reessaiMutation = useInitierPaiementEnLigneCommande();

  const [erreurReessai, setErreurReessai] = useState<string | null>(null);

  function reessayer(passerelle: PasserelleCommande) {
    if (!commande) return;
    setErreurReessai(null);
    reessaiMutation.mutate(
      { id: commande.id, payload: { passerelle } },
      {
        onSuccess: ({ redirect_url }) => {
          leiteZuZahlungWeiter(redirect_url);
        },
        onError: (error) => {
          setErreurReessai(extractApiErrorMessage(error, t("retour_paiement.erreur_reessai")));
        },
      },
    );
  }

  if (!commandeId) {
    return (
      <div className="mx-auto max-w-md rounded-cid-lg bg-bg-primary p-8 text-center shadow-sm">
        <div className="mb-3 text-sm text-status-dangerText">
          {t("retour_paiement.introuvable")}
        </div>
        <Link to="/boutique" className="text-sm font-medium text-ca hover:underline">
          {t("retour_paiement.retour_catalogue")}
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-md rounded-cid-lg bg-bg-primary p-8 text-center shadow-sm">
        <p className="text-sm text-text-tertiary">{t("retour_paiement.chargement")}</p>
      </div>
    );
  }

  if (isError || !commande) {
    return (
      <div className="mx-auto max-w-md rounded-cid-lg bg-bg-primary p-8 text-center shadow-sm">
        <div className="mb-3 text-sm text-status-dangerText">
          {t("retour_paiement.introuvable")}
        </div>
        <Link to="/boutique" className="text-sm font-medium text-ca hover:underline">
          {t("retour_paiement.retour_catalogue")}
        </Link>
      </div>
    );
  }

  const peutReessayer = commande.statut === "en_attente";
  const estPayee = commande.statut !== "en_attente" && commande.statut !== "annulee";

  let icone = "⏳";
  let iconeStyle = "bg-status-warningBg text-status-warningText";
  let titre = t("retour_paiement.titre_attente");
  let sousTitre = t("retour_paiement.sous_titre_attente");

  if (estPayee) {
    icone = "✓";
    iconeStyle = "bg-status-successBg text-status-successText";
    titre = t("retour_paiement.titre_confirmee");
    sousTitre = t("retour_paiement.sous_titre_confirmee");
  } else if (annule && commande.statut === "en_attente") {
    icone = "↩";
    iconeStyle = "bg-bg-tertiary text-text-secondary";
    titre = t("retour_paiement.titre_annule");
    sousTitre = t("retour_paiement.sous_titre_annule");
  }

  return (
    <div className="mx-auto max-w-md rounded-cid-lg bg-bg-primary p-8 text-center shadow-sm">
      <div
        className={`mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full text-2xl ${iconeStyle}`}
      >
        {icone}
      </div>
      <div className="mb-1 text-lg font-bold text-text-primary">{titre}</div>
      <div className="mb-4 text-sm text-text-tertiary">{sousTitre}</div>

      <dl className="mb-5 space-y-1.5 rounded-cid border border-text-tertiary/10 p-4 text-left text-sm">
        <div className="flex justify-between">
          <dt className="text-text-secondary">{t("retour_paiement.numero_commande")}</dt>
          <dd className="font-mono text-text-primary">{commande.numero_commande}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-text-secondary">{t("retour_paiement.montant")}</dt>
          <dd className="font-bold text-ca">{formatMontant(Number(commande.montant_total))}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-text-secondary">{t("retour_paiement.statut")}</dt>
          <dd className="text-text-primary">{t(`statut_commande.${commande.statut}`)}</dd>
        </div>
      </dl>

      {erreurReessai && <p className="mb-3 text-sm text-status-dangerText">{erreurReessai}</p>}

      <div className="flex flex-col items-center gap-2">
        <div className="flex flex-wrap justify-center gap-2">
          {!estPayee && (
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary disabled:opacity-40"
            >
              {isFetching
                ? t("retour_paiement.verification_en_cours")
                : t("retour_paiement.verifier")}
            </button>
          )}

          {peutReessayer && (
            <>
              <button
                type="button"
                onClick={() => reessayer("stripe")}
                disabled={reessaiMutation.isPending}
                className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-40"
              >
                {reessaiMutation.isPending
                  ? t("retour_paiement.reessai_en_cours")
                  : t("retour_paiement.reessayer_stripe")}
              </button>
              <button
                type="button"
                onClick={() => reessayer("paypal")}
                disabled={reessaiMutation.isPending}
                className="rounded-cid border border-ca px-3 py-1.5 text-sm font-medium text-ca hover:bg-cal/20 disabled:opacity-40"
              >
                {reessaiMutation.isPending
                  ? t("retour_paiement.reessai_en_cours")
                  : t("retour_paiement.reessayer_paypal")}
              </button>
            </>
          )}
        </div>

        <Link to="/boutique" className="text-sm font-medium text-ca hover:underline">
          {t("retour_paiement.retour_catalogue")}
        </Link>
      </div>
    </div>
  );
}
