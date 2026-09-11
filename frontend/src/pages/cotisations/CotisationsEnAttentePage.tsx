/**
 * File des paiements en attente à confirmer manuellement — vue Directeur Financier/Admin
 * (AHM-53). Il n'existe pas encore de passerelle de paiement réelle (AHM-46) : le stepper
 * libre-service (AHM-16) enregistre toujours un paiement déjà "payee", donc la seule façon
 * d'obtenir une cotisation "en_attente" aujourd'hui est une saisie manuelle pour un autre membre
 * (F-015) restée non réglée — ex. un virement SEPA en cours de réconciliation. Cette page
 * remplace le détour par l'admin Django pour confirmer ce paiement.
 *
 * Chaque ligne résout le nom du membre via useMembre(cotisation.membre) — un composant séparé
 * par ligne (CotisationEnAttenteRow), même raison que JustificatifQueueRow dans
 * AdminJustificatifsPage.tsx (règles des Hooks : pas d'appel de hook dans une boucle .map()).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useMembre } from "../../hooks/useMembres";
import { useCotisationsEnAttenteDePaiement, useMarquerCotisationPayee } from "../../hooks/useCotisations";
import type { Cotisation, ModePaiement } from "../../types/cotisation";
import { extractApiErrorMessage } from "../../utils/apiError";

const MODES_PAIEMENT: ModePaiement[] = ["carte", "virement_sepa", "paypal"];

function formatMontant(montant: string): string {
  return `${Number(montant).toFixed(2).replace(".", ",")} €`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

interface CotisationEnAttenteRowProps {
  cotisation: Cotisation;
}

function CotisationEnAttenteRow({ cotisation }: CotisationEnAttenteRowProps) {
  const { t } = useTranslation("cotisations");
  const membre = useMembre(cotisation.membre);
  const marquerPayeeMutation = useMarquerCotisationPayee();

  const [modePaiement, setModePaiement] = useState<ModePaiement>(
    (cotisation.mode_paiement as ModePaiement) || "virement_sepa",
  );

  function confirmerPaiement() {
    marquerPayeeMutation.mutate({ id: cotisation.id, payload: { mode_paiement: modePaiement } });
  }

  return (
    <tr className="border-b border-text-tertiary/10 last:border-0 align-top">
      <td className="px-4 py-2">{formatDate(cotisation.created_at)}</td>
      <td className="px-4 py-2">
        {membre.isLoading
          ? t("en_attente_paiement.chargement")
          : membre.data
            ? `${membre.data.prenom} ${membre.data.nom} (${membre.data.numero_membre})`
            : "—"}
      </td>
      <td className="px-4 py-2">{cotisation.libelle}</td>
      <td className="px-4 py-2 font-semibold text-ca">{formatMontant(cotisation.montant)}</td>
      <td className="px-4 py-2">
        <select
          value={modePaiement}
          onChange={(e) => setModePaiement(e.target.value as ModePaiement)}
          className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs"
        >
          {MODES_PAIEMENT.map((mode) => (
            <option key={mode} value={mode}>
              {t(`en_attente_paiement.mode.${mode}`)}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2">
        <button
          type="button"
          onClick={confirmerPaiement}
          disabled={marquerPayeeMutation.isPending}
          className="rounded-cid bg-status-successText px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          {marquerPayeeMutation.isPending
            ? t("en_attente_paiement.en_cours")
            : t("en_attente_paiement.confirmer")}
        </button>
        {marquerPayeeMutation.isError && (
          <p className="mt-1 text-xs text-status-dangerText">
            {extractApiErrorMessage(marquerPayeeMutation.error, t("en_attente_paiement.erreur_action"))}
          </p>
        )}
      </td>
    </tr>
  );
}

export default function CotisationsEnAttentePage() {
  const { t } = useTranslation("cotisations");
  const enAttente = useCotisationsEnAttenteDePaiement();

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-text-primary">{t("en_attente_paiement.titre")}</h1>
      <p className="mb-4 text-sm text-text-tertiary">{t("en_attente_paiement.sous_titre")}</p>

      <div className="overflow-x-auto rounded-cid-lg bg-bg-primary shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-text-tertiary/20 text-left text-xs font-semibold uppercase text-text-tertiary">
              <th className="px-4 py-2">{t("en_attente_paiement.col_date")}</th>
              <th className="px-4 py-2">{t("en_attente_paiement.col_membre")}</th>
              <th className="px-4 py-2">{t("en_attente_paiement.col_libelle")}</th>
              <th className="px-4 py-2">{t("en_attente_paiement.col_montant")}</th>
              <th className="px-4 py-2">{t("en_attente_paiement.col_mode")}</th>
              <th className="px-4 py-2">{t("en_attente_paiement.col_actions")}</th>
            </tr>
          </thead>
          <tbody>
            {enAttente.isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-text-tertiary">
                  {t("en_attente_paiement.chargement")}
                </td>
              </tr>
            )}
            {enAttente.isError && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-status-dangerText">
                  {t("en_attente_paiement.erreur_chargement")}
                </td>
              </tr>
            )}
            {enAttente.data && enAttente.data.results.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-text-tertiary">
                  {t("en_attente_paiement.aucun")}
                </td>
              </tr>
            )}
            {enAttente.data?.results.map((c) => (
              <CotisationEnAttenteRow key={c.id} cotisation={c} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
