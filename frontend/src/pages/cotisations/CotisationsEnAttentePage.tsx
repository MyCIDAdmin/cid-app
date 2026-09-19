/**
 * File des paiements en attente à confirmer manuellement — vue Directeur Financier/Admin
 * (AHM-53). Il n'existe pas encore de passerelle de paiement réelle (AHM-46) : le stepper
 * libre-service (AHM-16) enregistre toujours un paiement déjà "payee", donc la seule façon
 * d'obtenir une cotisation "en_attente" aujourd'hui est une saisie manuelle pour un autre membre
 * (F-015) restée non réglée — ex. un virement SEPA en cours de réconciliation. Cette page
 * remplace le détour par l'admin Django pour confirmer ce paiement.
 *
 * Élargie le 2026-09-19 (demande utilisateur : "Bei 'Ausstehende Zahlungen' muss es möglich sein
 * die Historie zu behalten und Zahlungsstatus nachträglich zu ändern") : un filtre de statut
 * permet de retrouver n'importe quelle cotisation (pas seulement "en_attente"), chaque ligne
 * gagne un historique dépliable (HistoriqueStatutCotisation) et un contrôle "changer le statut"
 * qui, contrairement à la confirmation rapide ci-dessous, autorise n'importe quelle transition —
 * y compris revenir en arrière depuis "payee" (décision actée avec l'utilisateur : "Admin kann
 * jeden Status ändern + volles Änderungsprotokoll").
 *
 * Chaque ligne résout le nom du membre via useMembre(cotisation.membre) — un composant séparé
 * par ligne (CotisationGestionRow), même raison que JustificatifQueueRow dans
 * AdminJustificatifsPage.tsx (règles des Hooks : pas d'appel de hook dans une boucle .map()).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useMembre } from "../../hooks/useMembres";
import {
  useChangerStatutCotisation,
  useCotisationsGestion,
  useHistoriqueStatutsCotisation,
  useMarquerCotisationPayee,
} from "../../hooks/useCotisations";
import type { Cotisation, ModePaiement, StatutCotisation } from "../../types/cotisation";
import { extractApiErrorMessage } from "../../utils/apiError";

const MODES_PAIEMENT: ModePaiement[] = ["carte", "virement_sepa", "paypal"];
const STATUTS: StatutCotisation[] = ["en_attente", "payee", "echouee", "remboursee", "annulee"];
const STATUTS_CONFIRMABLES: StatutCotisation[] = ["en_attente", "echouee"];

function formatMontant(montant: string): string {
  return `${Number(montant).toFixed(2).replace(".", ",")} €`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

function formatDateHeure(iso: string): string {
  return new Date(iso).toLocaleString();
}

interface CotisationGestionRowProps {
  cotisation: Cotisation;
}

function CotisationGestionRow({ cotisation }: CotisationGestionRowProps) {
  const { t } = useTranslation("cotisations");
  const membre = useMembre(cotisation.membre);
  const marquerPayeeMutation = useMarquerCotisationPayee();
  const changerStatutMutation = useChangerStatutCotisation();

  const [modePaiement, setModePaiement] = useState<ModePaiement>(
    (cotisation.mode_paiement as ModePaiement) || "virement_sepa",
  );
  const [historiqueOuvert, setHistoriqueOuvert] = useState(false);
  const [nouveauStatut, setNouveauStatut] = useState<StatutCotisation>(cotisation.statut);
  const [motif, setMotif] = useState("");

  const historique = useHistoriqueStatutsCotisation(cotisation.id, historiqueOuvert);

  function confirmerPaiement() {
    marquerPayeeMutation.mutate({ id: cotisation.id, payload: { mode_paiement: modePaiement } });
  }

  function appliquerChangementStatut() {
    changerStatutMutation.mutate(
      { id: cotisation.id, payload: { statut: nouveauStatut, motif } },
      { onSuccess: () => setMotif("") },
    );
  }

  return (
    <>
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
        <td className="px-4 py-2">{t(`statut.${cotisation.statut}`)}</td>
        <td className="px-4 py-2">
          {STATUTS_CONFIRMABLES.includes(cotisation.statut) && (
            <div className="mb-2 flex items-center gap-1">
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
            </div>
          )}
          {marquerPayeeMutation.isError && (
            <p className="mb-2 text-xs text-status-dangerText">
              {extractApiErrorMessage(marquerPayeeMutation.error, t("en_attente_paiement.erreur_action"))}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-1">
            <select
              aria-label={t("en_attente_paiement.changer_statut_label")}
              value={nouveauStatut}
              onChange={(e) => setNouveauStatut(e.target.value as StatutCotisation)}
              className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs"
            >
              {STATUTS.map((statut) => (
                <option key={statut} value={statut}>
                  {t(`statut.${statut}`)}
                </option>
              ))}
            </select>
            <input
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder={t("en_attente_paiement.motif_placeholder") ?? ""}
              className="min-w-[8rem] rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs"
            />
            <button
              type="button"
              onClick={appliquerChangementStatut}
              disabled={changerStatutMutation.isPending || nouveauStatut === cotisation.statut}
              className="rounded-cid border border-ca px-2 py-1 text-xs font-medium text-ca hover:bg-cal disabled:opacity-40"
            >
              {changerStatutMutation.isPending
                ? t("en_attente_paiement.en_cours")
                : t("en_attente_paiement.changer_statut")}
            </button>
            <button
              type="button"
              onClick={() => setHistoriqueOuvert((v) => !v)}
              className="rounded-cid px-2 py-1 text-xs text-text-secondary hover:bg-bg-tertiary"
            >
              {historiqueOuvert
                ? t("en_attente_paiement.masquer_historique")
                : t("en_attente_paiement.voir_historique")}
            </button>
          </div>
          {changerStatutMutation.isError && (
            <p className="mt-1 text-xs text-status-dangerText">
              {extractApiErrorMessage(
                changerStatutMutation.error,
                t("en_attente_paiement.erreur_changement_statut"),
              )}
            </p>
          )}
        </td>
      </tr>
      {historiqueOuvert && (
        <tr className="border-b border-text-tertiary/10 last:border-0 bg-bg-tertiary/30">
          <td colSpan={6} className="px-4 py-3">
            {historique.isLoading && (
              <p className="text-xs text-text-tertiary">{t("en_attente_paiement.chargement")}</p>
            )}
            {historique.isError && (
              <p className="text-xs text-status-dangerText">
                {t("en_attente_paiement.erreur_historique")}
              </p>
            )}
            {historique.data && historique.data.length === 0 && (
              <p className="text-xs text-text-tertiary">
                {t("en_attente_paiement.historique_vide")}
              </p>
            )}
            {historique.data && historique.data.length > 0 && (
              <ul className="space-y-1 text-xs text-text-secondary">
                {historique.data.map((entree) => (
                  <li key={entree.id}>
                    {formatDateHeure(entree.created_at)} — {t(`statut.${entree.ancien_statut}`)} →{" "}
                    {t(`statut.${entree.nouveau_statut}`)}
                    {entree.modifie_par_nom && ` (${entree.modifie_par_nom})`}
                    {entree.motif && ` — ${entree.motif}`}
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function CotisationsEnAttentePage() {
  const { t } = useTranslation("cotisations");
  const [statutFiltre, setStatutFiltre] = useState<StatutCotisation | "">("en_attente");
  const gestion = useCotisationsGestion(statutFiltre);

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-text-primary">{t("en_attente_paiement.titre")}</h1>
      <p className="mb-4 text-sm text-text-tertiary">{t("en_attente_paiement.sous_titre")}</p>

      <div className="mb-4 flex items-end gap-3 rounded-cid-lg bg-bg-primary p-3 shadow-sm">
        <div>
          <label
            htmlFor="cotisations-filtre-statut"
            className="mb-1 block text-[10px] uppercase text-text-tertiary"
          >
            {t("en_attente_paiement.filtre_statut")}
          </label>
          <select
            id="cotisations-filtre-statut"
            value={statutFiltre}
            onChange={(e) => setStatutFiltre(e.target.value as StatutCotisation | "")}
            className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          >
            <option value="">{t("en_attente_paiement.filtre_tous")}</option>
            {STATUTS.map((statut) => (
              <option key={statut} value={statut}>
                {t(`statut.${statut}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-cid-lg bg-bg-primary shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-text-tertiary/20 text-left text-xs font-semibold uppercase text-text-tertiary">
              <th className="px-4 py-2">{t("en_attente_paiement.col_date")}</th>
              <th className="px-4 py-2">{t("en_attente_paiement.col_membre")}</th>
              <th className="px-4 py-2">{t("en_attente_paiement.col_libelle")}</th>
              <th className="px-4 py-2">{t("en_attente_paiement.col_montant")}</th>
              <th className="px-4 py-2">{t("en_attente_paiement.col_statut")}</th>
              <th className="px-4 py-2">{t("en_attente_paiement.col_actions")}</th>
            </tr>
          </thead>
          <tbody>
            {gestion.isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-text-tertiary">
                  {t("en_attente_paiement.chargement")}
                </td>
              </tr>
            )}
            {gestion.isError && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-status-dangerText">
                  {t("en_attente_paiement.erreur_chargement")}
                </td>
              </tr>
            )}
            {gestion.data && gestion.data.results.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-text-tertiary">
                  {t("en_attente_paiement.aucun")}
                </td>
              </tr>
            )}
            {gestion.data?.results.map((c) => (
              <CotisationGestionRow key={c.id} cotisation={c} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
