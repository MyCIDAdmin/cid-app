/**
 * Onglet "Commandes" de la page Admin — Boutique (mockup #pg-admin-boutique, tab-pane
 * btq-cmd) : liste de toutes les commandes (Bureau Admin+ voit tout, voir
 * CommandeViewSet.get_queryset), filtrable par statut, avec changement de statut et
 * annulation. Ne couvre que la première page du cursor (comme les autres pages de gestion de
 * ce module — voir MonAdhesionPage) : limite connue, acceptable pour ce périmètre.
 *
 * Workflow paiement/expédition/retours (demande utilisateur du 2026-09-15, voir
 * apps/boutique/views.py côté backend) :
 *   - "Zahlungseingang bestätigen" (confirmer_paiement) et "Versenden"/"Nacherfassung"
 *     (expedier) sont réservés à PAIEMENT_EXPEDITION_MIN_LEVEL (Directeur Financier+),
 *     seuil plus strict que la gestion générale des commandes — gaté ici via
 *     `hasRoleAtLeast(user, ROLE_LEVELS.dir_financier)`, en miroir de CommandePermission
 *     côté backend (le backend reste seul juge, ce gating n'est qu'un confort d'UI).
 *   - "Retoure erfassen" (création d'un Retour) reste au seuil Bureau Admin+, comme le
 *     reste de la gestion des commandes.
 *
 * Lecture seule (task #216, 2026-09-24) : `modifiable` (optionnel, défaut `true` pour ne pas
 * casser les tests existants qui rendent ce composant seul) vient de la matrice "page_boutique"
 * via AdminBoutiquePage/usePageAccess — désactive "changer_statut" et la création d'un Retour.
 * "confirmer_paiement"/"expedier" restent EXCLUSIVEMENT sous `peutConfirmerPaiementEtExpedier`
 * ci-dessus (hors périmètre de la matrice, voir docstring ci-dessus) : volontairement PAS gatés
 * par `modifiable`.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import ConfirmDialog from "../ui/ConfirmDialog";
import {
  exporterCommandesExcel,
  telechargerConfirmationCommande,
  telechargerFactureCommande,
} from "../../api/boutique";
import {
  useAnnulerCommande,
  useChangerStatutCommande,
  useCommandes,
  useConfirmerPaiementCommande,
  useCreerRetourLot,
  useExpedierCommande,
} from "../../hooks/useBoutique";
import { hasRoleAtLeast, ROLE_LEVELS, useAuthStore } from "../../store/authStore";
import {
  STATUTS_ANNULABLES,
  STATUTS_CONFIRMABLES_PAIEMENT,
  STATUTS_EXPEDIABLES_NORMAL,
  STATUTS_RETOURNABLES,
  TRANSITIONS_STATUT_COMMANDE,
  type Commande,
  type ModePaiementCommande,
  type MotifRetour,
  type StatutCommande,
} from "../../types/boutique";
import { extractApiErrorMessage } from "../../utils/apiError";

/** Déclenche le téléchargement d'un blob côté navigateur — même pattern que
 * CotisationStepperPage.telechargerRecu/MembresListPage.exporter. */
function declencherTelechargement(blob: Blob, nomFichier: string) {
  const url = window.URL.createObjectURL(blob);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = nomFichier;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  window.URL.revokeObjectURL(url);
}

const MODES_PAIEMENT: ModePaiementCommande[] = ["en_ligne", "virement", "especes"];
const MOTIFS_RETOUR: MotifRetour[] = [
  "defectueux",
  "mauvaise_taille",
  "ne_convient_pas",
  "erreur_envoi",
  "autre",
];

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

interface ExpeditionModalState {
  commande: Commande;
  nacherfassement: boolean;
}

export default function GestionCommandesTab({ modifiable = true }: { modifiable?: boolean } = {}) {
  const { t } = useTranslation(["boutique", "common"]);
  const user = useAuthStore((s) => s.user);
  const peutConfirmerPaiementEtExpedier = hasRoleAtLeast(user, ROLE_LEVELS.dir_financier);
  const peutGererRetours = hasRoleAtLeast(user, ROLE_LEVELS.bureau_admin);

  const [filtreStatut, setFiltreStatut] = useState<StatutCommande | "">("");
  // Filtres destinataire/intervalle de dates (demande utilisateur du 2026-09-25, module
  // "Shop-Verwaltung" : "Filtermöglichkeiten hinzufügen z.B. Datumsintervall, Empfänger") — même
  // convention (état contrôlé directement branché sur la query, sans debounce) que
  // MembresListPage.tsx.
  const [filtreDestinataire, setFiltreDestinataire] = useState("");
  const [filtreDateApres, setFiltreDateApres] = useState("");
  const [filtreDateAvant, setFiltreDateAvant] = useState("");
  const [commandeAAnnuler, setCommandeAAnnuler] = useState<Commande | null>(null);
  const [modePaiementParCommande, setModePaiementParCommande] = useState<
    Record<string, ModePaiementCommande>
  >({});
  // Date de transaction backdatée par commande (demande utilisateur du 2026-09-29 : "Bei
  // Zahlungsbestätigung Im Modul [...] 'Shop Verwaltung' das Transaktionsdatum bei der
  // Bestätigung hinzufügen") — vide par défaut (comportement inchangé : date/heure actuelles
  // côté backend, voir ConfirmerPaiementCommandePayload).
  const [datePaiementParCommande, setDatePaiementParCommande] = useState<Record<string, string>>(
    {},
  );

  // Téléchargement des documents PDF (confirmation/facture, demande utilisateur du 2026-09-25) —
  // `documentEnCours` retient "<commandeId>-<type>" pour ne désactiver que le bouton concerné.
  const [documentEnCours, setDocumentEnCours] = useState<string | null>(null);
  const [erreurDocument, setErreurDocument] = useState<string | null>(null);
  const [exportEnCours, setExportEnCours] = useState(false);
  const [erreurExport, setErreurExport] = useState<string | null>(null);

  const [expeditionModal, setExpeditionModal] = useState<ExpeditionModalState | null>(null);
  const [numeroSuivi, setNumeroSuivi] = useState("");
  const [transporteurSaisi, setTransporteurSaisi] = useState("");
  const [dateExpeditionSaisie, setDateExpeditionSaisie] = useState("");
  const [modePaiementNacherfassung, setModePaiementNacherfassung] =
    useState<ModePaiementCommande>("especes");

  // Retour multi-variantes (demande utilisateur du 2026-09-29 : "Bei Shop Verwaltung für
  // Retoure soll es möglich sein, Mengen pro Varianten einzugeben") — `quantitesRetour` associe
  // chaque ligne retournable de la commande à la quantité saisie pour CE retour (0 = ligne non
  // incluse dans le lot), plutôt qu'une seule ligne sélectionnée via <select> comme avant. Motif/
  // commentaire restent partagés pour tout le lot (voir RetourLotPayload/RetourViewSet.lot).
  const [retourModal, setRetourModal] = useState<Commande | null>(null);
  const [quantitesRetour, setQuantitesRetour] = useState<Record<string, number>>({});
  const [motifRetour, setMotifRetour] = useState<MotifRetour>("autre");
  const [commentaireRetour, setCommentaireRetour] = useState("");

  const commandesQuery = useCommandes({
    statut: filtreStatut || undefined,
    destinataire: filtreDestinataire || undefined,
    date_apres: filtreDateApres || undefined,
    date_avant: filtreDateAvant || undefined,
  });
  const changerStatutMutation = useChangerStatutCommande();
  const annulerMutation = useAnnulerCommande();
  const confirmerPaiementMutation = useConfirmerPaiementCommande();
  const expedierMutation = useExpedierCommande();
  const creerRetourMutation = useCreerRetourLot();

  async function telechargerConfirmation(commande: Commande) {
    setErreurDocument(null);
    setDocumentEnCours(`${commande.id}-confirmation`);
    try {
      const blob = await telechargerConfirmationCommande(commande.id);
      declencherTelechargement(blob, `bestellbestaetigung-${commande.numero_commande}.pdf`);
    } catch (error) {
      setErreurDocument(extractApiErrorMessage(error, t("commandes_admin.erreur_document")));
    } finally {
      setDocumentEnCours(null);
    }
  }

  async function telechargerFacture(commande: Commande) {
    setErreurDocument(null);
    setDocumentEnCours(`${commande.id}-facture`);
    try {
      const blob = await telechargerFactureCommande(commande.id);
      declencherTelechargement(blob, `rechnung-${commande.numero_commande}.pdf`);
    } catch (error) {
      setErreurDocument(extractApiErrorMessage(error, t("commandes_admin.erreur_document")));
    } finally {
      setDocumentEnCours(null);
    }
  }

  async function exporterExcel() {
    setErreurExport(null);
    setExportEnCours(true);
    try {
      const { blob, nomFichier } = await exporterCommandesExcel({
        statut: filtreStatut || undefined,
        destinataire: filtreDestinataire || undefined,
        date_apres: filtreDateApres || undefined,
        date_avant: filtreDateAvant || undefined,
      });
      declencherTelechargement(blob, nomFichier);
    } catch (error) {
      setErreurExport(extractApiErrorMessage(error, t("commandes_admin.export_erreur")));
    } finally {
      setExportEnCours(false);
    }
  }

  function confirmerAnnulation() {
    if (!commandeAAnnuler) return;
    annulerMutation.mutate(commandeAAnnuler.id, { onSuccess: () => setCommandeAAnnuler(null) });
  }

  function confirmerPaiement(commande: Commande) {
    confirmerPaiementMutation.mutate({
      id: commande.id,
      payload: {
        mode_paiement: modePaiementParCommande[commande.id] ?? "virement",
        date_paiement: datePaiementParCommande[commande.id] || undefined,
      },
    });
  }

  function ouvrirExpedition(commande: Commande, nacherfassement: boolean) {
    setExpeditionModal({ commande, nacherfassement });
    setNumeroSuivi("");
    setTransporteurSaisi("");
    setDateExpeditionSaisie("");
    setModePaiementNacherfassung("especes");
  }

  function soumettreExpedition() {
    if (!expeditionModal || !numeroSuivi) return;
    expedierMutation.mutate(
      {
        id: expeditionModal.commande.id,
        payload: {
          numero_suivi: numeroSuivi,
          transporteur: transporteurSaisi || undefined,
          nacherfassement: expeditionModal.nacherfassement,
          ...(expeditionModal.nacherfassement && {
            mode_paiement: modePaiementNacherfassung,
            ...(dateExpeditionSaisie && {
              date_expedition: new Date(dateExpeditionSaisie).toISOString(),
            }),
          }),
        },
      },
      { onSuccess: () => setExpeditionModal(null) },
    );
  }

  function ouvrirRetour(commande: Commande) {
    setRetourModal(commande);
    setQuantitesRetour({});
    setMotifRetour("autre");
    setCommentaireRetour("");
  }

  // Lignes retournables de la commande ouverte, dans l'ordre — calculé une fois ici plutôt
  // qu'inline dans le JSX (utilisé à la fois pour le rendu des champs et pour la validation).
  const lignesRetournables = retourModal?.lignes.filter((l) => l.quantite_retournable > 0) ?? [];

  // Lot effectivement soumis : uniquement les lignes où l'admin a saisi une quantité > 0 (voir
  // RetourLotSerializer.validate_lignes côté backend, qui refuse un lot vide).
  const lignesDuLot = lignesRetournables
    .map((l) => ({ ligne_commande: l.id, quantite: quantitesRetour[l.id] ?? 0 }))
    .filter((l) => l.quantite > 0);

  function soumettreRetour() {
    if (!retourModal || lignesDuLot.length === 0) return;
    creerRetourMutation.mutate(
      {
        commande: retourModal.id,
        motif: motifRetour,
        commentaire: commentaireRetour || undefined,
        lignes: lignesDuLot,
      },
      { onSuccess: () => setRetourModal(null) },
    );
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

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <input
          type="text"
          value={filtreDestinataire}
          onChange={(e) => setFiltreDestinataire(e.target.value)}
          placeholder={t("commandes_admin.filtre_destinataire_placeholder") ?? ""}
          className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-xs"
        />
        <label className="flex flex-col text-[10px] font-medium text-text-secondary">
          {t("commandes_admin.filtre_date_apres_label")}
          <input
            type="date"
            value={filtreDateApres}
            onChange={(e) => setFiltreDateApres(e.target.value)}
            className="mt-0.5 rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs"
          />
        </label>
        <label className="flex flex-col text-[10px] font-medium text-text-secondary">
          {t("commandes_admin.filtre_date_avant_label")}
          <input
            type="date"
            value={filtreDateAvant}
            onChange={(e) => setFiltreDateAvant(e.target.value)}
            className="mt-0.5 rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs"
          />
        </label>
        <button
          type="button"
          onClick={exporterExcel}
          disabled={exportEnCours}
          className="ml-auto rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-tertiary disabled:opacity-50"
        >
          {exportEnCours
            ? t("commandes_admin.export_en_cours")
            : t("commandes_admin.exporter_excel")}
        </button>
      </div>

      {erreurExport && <p className="mb-2 text-xs text-status-dangerText">{erreurExport}</p>}
      {erreurDocument && <p className="mb-2 text-xs text-status-dangerText">{erreurDocument}</p>}

      {changerStatutMutation.isError && (
        <p className="mb-2 text-xs text-status-dangerText">
          {extractApiErrorMessage(changerStatutMutation.error, t("commandes_admin.erreur_statut"))}
        </p>
      )}
      {confirmerPaiementMutation.isError && (
        <p className="mb-2 text-xs text-status-dangerText">
          {extractApiErrorMessage(confirmerPaiementMutation.error, t("paiement.erreur"))}
        </p>
      )}
      {expedierMutation.isError && !expeditionModal && (
        <p className="mb-2 text-xs text-status-dangerText">
          {extractApiErrorMessage(expedierMutation.error, t("expedition.erreur"))}
        </p>
      )}
      {creerRetourMutation.isError && !retourModal && (
        <p className="mb-2 text-xs text-status-dangerText">
          {extractApiErrorMessage(creerRetourMutation.error, t("retour.erreur"))}
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
              <th className="px-3 py-2">{t("commandes_admin.col_confirmation")}</th>
              <th className="px-3 py-2">{t("commandes_admin.col_facture")}</th>
              <th className="px-3 py-2">{t("commandes_admin.col_actions")}</th>
            </tr>
          </thead>
          <tbody>
            {commandesQuery.data?.results.map((commande) => {
              const transitions = TRANSITIONS_STATUT_COMMANDE[commande.statut];
              return (
                <tr key={commande.id} className="border-b border-text-tertiary/10 last:border-0">
                  <td className="px-3 py-2 font-mono">
                    {commande.numero_commande}
                    {commande.numero_suivi && (
                      <div className="mt-0.5 font-sans text-[10px] font-normal text-text-tertiary">
                        {t("expedition.suivi_label", {
                          numero: commande.numero_suivi,
                          transporteur: commande.transporteur || "—",
                        })}
                      </div>
                    )}
                  </td>
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
                    <button
                      type="button"
                      aria-label={t("commandes_admin.telecharger_confirmation_aria")}
                      onClick={() => telechargerConfirmation(commande)}
                      disabled={documentEnCours === `${commande.id}-confirmation`}
                      className="font-medium text-ca hover:underline disabled:opacity-40"
                    >
                      PDF
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    {commande.date_paiement_confirme ? (
                      <button
                        type="button"
                        aria-label={t("commandes_admin.telecharger_facture_aria")}
                        onClick={() => telechargerFacture(commande)}
                        disabled={documentEnCours === `${commande.id}-facture`}
                        className="font-medium text-ca hover:underline disabled:opacity-40"
                      >
                        PDF
                      </button>
                    ) : (
                      <span className="text-text-tertiary">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {transitions.length > 0 && (
                        <select
                          aria-label={t("commandes_admin.changer_statut")}
                          defaultValue=""
                          disabled={!modifiable}
                          title={!modifiable ? (t("common:acces.lecture_seule_tooltip") ?? "") : ""}
                          onChange={(e) => {
                            // Garde de défense en profondeur — voir
                            // GestionCatalogueTab.toggleStatut pour le raisonnement (onChange,
                            // pas un <button disabled>).
                            if (!e.target.value || !modifiable) return;
                            changerStatutMutation.mutate({
                              id: commande.id,
                              payload: { statut: e.target.value as StatutCommande },
                            });
                            e.target.value = "";
                          }}
                          className="rounded-cid border border-text-tertiary/30 px-1.5 py-1 text-[11px] disabled:opacity-40"
                        >
                          <option value="">{t("commandes_admin.changer_statut")}</option>
                          {transitions.map((s) => (
                            <option key={s} value={s}>
                              {t(`statut_commande.${s}`)}
                            </option>
                          ))}
                        </select>
                      )}

                      {peutConfirmerPaiementEtExpedier &&
                        STATUTS_CONFIRMABLES_PAIEMENT.includes(commande.statut) && (
                          <span className="flex items-center gap-1">
                            <select
                              aria-label={t("paiement.mode_label")}
                              value={modePaiementParCommande[commande.id] ?? "virement"}
                              onChange={(e) =>
                                setModePaiementParCommande((prev) => ({
                                  ...prev,
                                  [commande.id]: e.target.value as ModePaiementCommande,
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
                            <input
                              type="date"
                              aria-label={t("paiement.date_paiement_label")}
                              value={datePaiementParCommande[commande.id] ?? ""}
                              onChange={(e) =>
                                setDatePaiementParCommande((prev) => ({
                                  ...prev,
                                  [commande.id]: e.target.value,
                                }))
                              }
                              max={new Date().toISOString().slice(0, 10)}
                              className="rounded-cid border border-text-tertiary/30 px-1.5 py-1 text-[11px]"
                            />
                            <button
                              type="button"
                              onClick={() => confirmerPaiement(commande)}
                              disabled={confirmerPaiementMutation.isPending}
                              className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-[11px] text-status-successText hover:bg-bg-tertiary disabled:opacity-50"
                            >
                              {t("paiement.confirmer")}
                            </button>
                          </span>
                        )}

                      {peutConfirmerPaiementEtExpedier &&
                        STATUTS_EXPEDIABLES_NORMAL.includes(commande.statut) && (
                          <button
                            type="button"
                            onClick={() => ouvrirExpedition(commande, false)}
                            className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-tertiary"
                          >
                            {t("expedition.expedier")}
                          </button>
                        )}

                      {peutConfirmerPaiementEtExpedier && commande.statut === "en_attente" && (
                        <button
                          type="button"
                          onClick={() => ouvrirExpedition(commande, true)}
                          className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-tertiary"
                        >
                          {t("nacherfassung.bouton")}
                        </button>
                      )}

                      {peutGererRetours &&
                        STATUTS_RETOURNABLES.includes(commande.statut) &&
                        commande.lignes.some((l) => l.quantite_retournable > 0) && (
                          <button
                            type="button"
                            onClick={() => ouvrirRetour(commande)}
                            disabled={!modifiable}
                            title={
                              !modifiable ? (t("common:acces.lecture_seule_tooltip") ?? "") : ""
                            }
                            className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-tertiary disabled:opacity-40"
                          >
                            {t("retour.bouton")}
                          </button>
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

      {expeditionModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="expedition-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-sm rounded-cid-lg bg-bg-primary p-5 shadow-xl">
            <h2 id="expedition-modal-title" className="text-base font-semibold text-text-primary">
              {expeditionModal.nacherfassement ? t("nacherfassung.titre") : t("expedition.titre")}
            </h2>
            <p className="mt-1 text-xs text-text-tertiary">
              {expeditionModal.commande.numero_commande}
            </p>

            <div className="mt-3 flex flex-col gap-2">
              <label className="text-xs font-medium text-text-secondary">
                {t("expedition.numero_suivi_label")}
                <input
                  type="text"
                  value={numeroSuivi}
                  onChange={(e) => setNumeroSuivi(e.target.value)}
                  className="mt-1 w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-text-secondary">
                {t("expedition.transporteur_label")}
                <input
                  type="text"
                  value={transporteurSaisi}
                  onChange={(e) => setTransporteurSaisi(e.target.value)}
                  className="mt-1 w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
                />
              </label>

              {expeditionModal.nacherfassement && (
                <>
                  <label className="text-xs font-medium text-text-secondary">
                    {t("paiement.mode_label")}
                    <select
                      value={modePaiementNacherfassung}
                      onChange={(e) =>
                        setModePaiementNacherfassung(e.target.value as ModePaiementCommande)
                      }
                      className="mt-1 w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
                    >
                      {MODES_PAIEMENT.map((m) => (
                        <option key={m} value={m}>
                          {t(`paiement.mode.${m}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-medium text-text-secondary">
                    {t("nacherfassung.date_expedition_label")}
                    <input
                      type="datetime-local"
                      value={dateExpeditionSaisie}
                      onChange={(e) => setDateExpeditionSaisie(e.target.value)}
                      className="mt-1 w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
                    />
                  </label>
                </>
              )}
            </div>

            {expedierMutation.isError && (
              <p className="mt-2 text-xs text-status-dangerText">
                {extractApiErrorMessage(expedierMutation.error, t("expedition.erreur"))}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setExpeditionModal(null)}
                className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary"
              >
                {t("modal_annuler")}
              </button>
              <button
                type="button"
                onClick={soumettreExpedition}
                disabled={!numeroSuivi || expedierMutation.isPending}
                className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-50"
              >
                {expeditionModal.nacherfassement
                  ? t("nacherfassung.confirmer")
                  : t("expedition.confirmer")}
              </button>
            </div>
          </div>
        </div>
      )}

      {retourModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="retour-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-sm rounded-cid-lg bg-bg-primary p-5 shadow-xl">
            <h2 id="retour-modal-title" className="text-base font-semibold text-text-primary">
              {t("retour.titre")}
            </h2>
            <p className="mt-1 text-xs text-text-tertiary">{retourModal.numero_commande}</p>

            <div className="mt-3 flex flex-col gap-2">
              <p className="text-xs font-medium text-text-secondary">{t("retour.lignes_titre")}</p>
              {/* Une ligne par variante retournable (demande utilisateur du 2026-09-29 : "Mengen
                  pro Varianten einzugeben") — un input à 0 signifie "pas incluse dans ce retour",
                  voir lignesDuLot ci-dessus. */}
              <div className="flex flex-col gap-2 rounded-cid border border-text-tertiary/20 p-2">
                {lignesRetournables.map((l) => (
                  <div key={l.id} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-text-secondary">
                      {t("retour.ligne_option", {
                        quantite: l.quantite,
                        prix: l.prix_unitaire,
                        retournable: l.quantite_retournable,
                      })}
                    </span>
                    <input
                      type="number"
                      aria-label={t("retour.quantite_label")}
                      min={0}
                      max={l.quantite_retournable}
                      value={quantitesRetour[l.id] ?? 0}
                      onChange={(e) => {
                        const valeur = Math.max(
                          0,
                          Math.min(Number(e.target.value), l.quantite_retournable),
                        );
                        setQuantitesRetour((prev) => ({ ...prev, [l.id]: valeur }));
                      }}
                      className="w-20 rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
                    />
                  </div>
                ))}
              </div>
              <label className="text-xs font-medium text-text-secondary">
                {t("retour.motif_label")}
                <select
                  value={motifRetour}
                  onChange={(e) => setMotifRetour(e.target.value as MotifRetour)}
                  className="mt-1 w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
                >
                  {MOTIFS_RETOUR.map((m) => (
                    <option key={m} value={m}>
                      {t(`retour.motif.${m}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-text-secondary">
                {t("retour.commentaire_label")}
                <textarea
                  value={commentaireRetour}
                  onChange={(e) => setCommentaireRetour(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
                />
              </label>
            </div>

            {creerRetourMutation.isError && (
              <p className="mt-2 text-xs text-status-dangerText">
                {extractApiErrorMessage(creerRetourMutation.error, t("retour.erreur"))}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRetourModal(null)}
                className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary"
              >
                {t("modal_annuler")}
              </button>
              <button
                type="button"
                onClick={soumettreRetour}
                disabled={lignesDuLot.length === 0 || creerRetourMutation.isPending || !modifiable}
                title={!modifiable ? (t("common:acces.lecture_seule_tooltip") ?? "") : ""}
                className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-50"
              >
                {t("retour.confirmer")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
