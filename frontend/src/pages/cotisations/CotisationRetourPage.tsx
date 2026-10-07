/**
 * Page de retour après paiement en ligne (AHM-46) — cible de `success_url`/`cancel_url` (Stripe)
 * et `return_url`/`cancel_url` (PayPal), voir apps.cotisations.gateways.
 * `?cotisation=<id>` identifie la cotisation ; `?annule=1` indique que le membre a annulé sur la
 * page du PSP avant de finaliser.
 *
 * Le webhook (apps.cotisations.webhooks) est asynchrone : au moment où ce navigateur revient
 * ici, la confirmation serveur (statut=payee/echouee) peut ne pas être encore arrivée. Cette page
 * affiche donc le statut réel de la cotisation (jamais déduit de l'URL de retour elle-même) et
 * propose un bouton "vérifier à nouveau" plutôt qu'un polling automatique — plus simple et
 * suffisant pour le volume de cette association.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";

import { telechargerRecuCotisation } from "../../api/cotisations";
import { useCotisation, useInitierPaiementEnLigne } from "../../hooks/useCotisations";
import type { ModePaiement } from "../../types/cotisation";
import { extractApiErrorMessage } from "../../utils/apiError";
import { leiteZuZahlungWeiter } from "../../utils/sicherUrl";

const MODES_GATEWAY: ModePaiement[] = ["carte", "paypal"];

function formatMontant(montant: number): string {
  return `${montant.toFixed(2).replace(".", ",")} €`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

export default function CotisationRetourPage() {
  const { t } = useTranslation("cotisations");
  const [searchParams] = useSearchParams();
  const cotisationId = searchParams.get("cotisation") ?? undefined;
  const annule = searchParams.get("annule") === "1";

  const { data: cotisation, isLoading, isError, isFetching, refetch } = useCotisation(cotisationId);
  const reessaiMutation = useInitierPaiementEnLigne();

  const [recuEnCours, setRecuEnCours] = useState(false);
  const [erreurRecu, setErreurRecu] = useState<string | null>(null);
  const [erreurReessai, setErreurReessai] = useState<string | null>(null);

  async function telechargerRecu() {
    if (!cotisation) return;
    setErreurRecu(null);
    setRecuEnCours(true);
    try {
      const blob = await telechargerRecuCotisation(cotisation.id);
      const url = window.URL.createObjectURL(blob);
      const lien = document.createElement("a");
      lien.href = url;
      lien.download = `recu-${cotisation.reference_transaction ?? cotisation.id}.pdf`;
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setErreurRecu(extractApiErrorMessage(error, t("recu.erreur")));
    } finally {
      setRecuEnCours(false);
    }
  }

  function reessayer() {
    if (!cotisation) return;
    setErreurReessai(null);
    reessaiMutation.mutate(cotisation.id, {
      onSuccess: ({ redirect_url }) => {
        leiteZuZahlungWeiter(redirect_url);
      },
      onError: (error) => {
        setErreurReessai(extractApiErrorMessage(error, t("retour.erreur_reessai")));
      },
    });
  }

  if (!cotisationId) {
    return (
      <div className="mx-auto max-w-md rounded-cid-lg bg-bg-primary p-8 text-center shadow-sm">
        <div className="mb-3 text-sm text-status-dangerText">{t("retour.introuvable")}</div>
        <Link to="/mon-adhesion" className="text-sm font-medium text-ca hover:underline">
          {t("retour.retour_accueil")}
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-md rounded-cid-lg bg-bg-primary p-8 text-center shadow-sm">
        <p className="text-sm text-text-tertiary">{t("retour.chargement")}</p>
      </div>
    );
  }

  if (isError || !cotisation) {
    return (
      <div className="mx-auto max-w-md rounded-cid-lg bg-bg-primary p-8 text-center shadow-sm">
        <div className="mb-3 text-sm text-status-dangerText">{t("retour.introuvable")}</div>
        <Link to="/mon-adhesion" className="text-sm font-medium text-ca hover:underline">
          {t("retour.retour_accueil")}
        </Link>
      </div>
    );
  }

  const peutReessayer = MODES_GATEWAY.includes(cotisation.mode_paiement as ModePaiement);

  let icone = "⏳";
  let iconeStyle = "bg-status-warningBg text-status-warningText";
  let titre = t("retour.titre_attente");
  let sousTitre = t("retour.sous_titre_attente");

  if (cotisation.statut === "payee") {
    icone = "✓";
    iconeStyle = "bg-status-successBg text-status-successText";
    titre = t("retour.titre_payee");
    sousTitre = t("retour.sous_titre_payee");
  } else if (cotisation.statut === "echouee") {
    icone = "✕";
    iconeStyle = "bg-status-dangerBg text-status-dangerText";
    titre = t("retour.titre_echouee");
    sousTitre = t("retour.sous_titre_echouee");
  } else if (annule) {
    icone = "↩";
    iconeStyle = "bg-bg-tertiary text-text-secondary";
    titre = t("retour.titre_annule");
    sousTitre = t("retour.sous_titre_annule");
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
        {cotisation.reference_transaction && (
          <div className="flex justify-between">
            <dt className="text-text-secondary">{t("confirmation.reference")}</dt>
            <dd className="font-mono text-text-primary">{cotisation.reference_transaction}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-text-secondary">{t("confirmation.article")}</dt>
          <dd className="text-text-primary">{cotisation.libelle}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-text-secondary">{t("confirmation.montant")}</dt>
          <dd className="font-bold text-ca">{formatMontant(Number(cotisation.montant))}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-text-secondary">
            {cotisation.statut === "payee" ? t("confirmation.date") : t("confirmation.statut")}
          </dt>
          <dd className="text-text-primary">
            {cotisation.statut === "payee"
              ? formatDate(cotisation.date_paiement)
              : t(`statut.${cotisation.statut}`)}
          </dd>
        </div>
      </dl>

      {erreurRecu && <p className="mb-3 text-sm text-status-dangerText">{erreurRecu}</p>}
      {erreurReessai && <p className="mb-3 text-sm text-status-dangerText">{erreurReessai}</p>}

      <div className="flex flex-col items-center gap-2">
        <div className="flex justify-center gap-2">
          {cotisation.statut === "payee" && (
            <button
              type="button"
              onClick={telechargerRecu}
              disabled={recuEnCours}
              className="rounded-cid border border-ca px-3 py-1.5 text-sm font-medium text-ca hover:bg-cal/20 disabled:opacity-40"
            >
              {recuEnCours ? t("recu.en_cours") : t("recu.telecharger")}
            </button>
          )}

          {cotisation.statut !== "payee" && (
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary disabled:opacity-40"
            >
              {isFetching ? t("retour.verification_en_cours") : t("retour.verifier")}
            </button>
          )}

          {peutReessayer && cotisation.statut !== "payee" && (
            <button
              type="button"
              onClick={reessayer}
              disabled={reessaiMutation.isPending}
              className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-40"
            >
              {reessaiMutation.isPending ? t("retour.reessai_en_cours") : t("retour.reessayer")}
            </button>
          )}
        </div>

        <Link to="/mon-adhesion" className="text-sm font-medium text-ca hover:underline">
          {t("retour.retour_accueil")}
        </Link>
      </div>
    </div>
  );
}
