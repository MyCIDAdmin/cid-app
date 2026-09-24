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
  useAnnulerCommande,
  useChangerStatutCommande,
  useCommandes,
  useConfirmerPaiementCommande,
  useCreerRetour,
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

export default function GestionCommandesTab({
  modifiable = true,
}: { modifiable?: boolean } = {}) {
  const { t } = useTranslation(["boutique", "common"]);
  const user = useAuthStore((s) => s.user);
  const peutConfirmerPaiementEtExpedier = hasRoleAtLeast(user, ROLE_LEVELS.dir_financier);
  const peutGererRetours = hasRoleAtLeast(user, ROLE_LEVELS.bureau_admin);

  const [filtreStatut, setFiltreStatut] = useState<StatutCommande | "">("");
  const [commandeAAnnuler, setCommandeAAnnuler] = useState<Commande | null>(null);
  const [modePaiementParCommande, setModePaiementParCommande] = useState<
    Record<string, ModePaiementCommande>
  >({});

  const [expeditionModal, setExpeditionModal] = useState<ExpeditionModalState | null>(null);
  const [numeroSuivi, setNumeroSuivi] = useState("");
  const [transporteurSaisi, setTransporteurSaisi] = useState("");
  const [dateExpeditionSaisie, setDateExpeditionSaisie] = useState("");
  const [modePaiementNacherfassung, setModePaiementNacherfassung] =
    useState<ModePaiementCommande>("especes");

  const [retourModal, setRetourModal] = useState<Commande | null>(null);
  const [ligneRetourId, setLigneRetourId] = useState("");
  const [quantiteRetour, setQuantiteRetour] = useState(1);
  const [motifRetour, setMotifRetour] = useState<MotifRetour>("autre");
  const [commentaireRetour, setCommentaireRetour] = useState("");

  const commandesQuery = useCommandes({ statut: filtreStatut || undefined });
  const changerStatutMutation = useChangerStatutCommande();
  const annulerMutation = useAnnulerCommande();
  const confirmerPaiementMutation = useConfirmerPaiementCommande();
  const expedierMutation = useExpedierCommande();
  const creerRetourMutation = useCreerRetour();

  function confirmerAnnulation() {
    if (!commandeAAnnuler) return;
    annulerMutation.mutate(commandeAAnnuler.id, { onSuccess: () => setCommandeAAnnuler(null) });
  }

  function confirmerPaiement(commande: Commande) {
    confirmerPaiementMutation.mutate({
      id: commande.id,
      payload: { mode_paiement: modePaiementParCommande[commande.id] ?? "virement" },
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
    const premiereLigne = commande.lignes.find((l) => l.quantite_retournable > 0);
    setLigneRetourId(premiereLigne?.id ?? "");
    setQuantiteRetour(1);
    setMotifRetour("autre");
    setCommentaireRetour("");
  }

  function soumettreRetour() {
    if (!retourModal || !ligneRetourId) return;
    creerRetourMutation.mutate(
      {
        commande: retourModal.id,
        ligne_commande: ligneRetourId,
        quantite: quantiteRetour,
        motif: motifRetour,
        commentaire: commentaireRetour || undefined,
      },
      { onSuccess: () => setRetourModal(null) },
    );
  }

  const ligneRetourSelectionnee = retourModal?.lignes.find((l) => l.id === ligneRetourId);

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
                    <div className="flex flex-wrap items-center gap-1.5">
                      {transitions.length > 0 && (
                        <select
                          aria-label={t("commandes_admin.changer_statut")}
                          defaultValue=""
                          disabled={!modifiable}
                          title={!modifiable ? t("common:acces.lecture_seule_tooltip") ?? "" : ""}
                          onChange={(e) => {
                            if (!e.target.value) return;
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
                            title={!modifiable ? t("common:acces.lecture_seule_tooltip") ?? "" : ""}
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
              <label className="text-xs font-medium text-text-secondary">
                {t("retour.ligne_label")}
                <select
                  value={ligneRetourId}
                  onChange={(e) => {
                    setLigneRetourId(e.target.value);
                    setQuantiteRetour(1);
                  }}
                  className="mt-1 w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
                >
                  {retourModal.lignes
                    .filter((l) => l.quantite_retournable > 0)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {t("retour.ligne_option", {
                          quantite: l.quantite,
                          prix: l.prix_unitaire,
                          retournable: l.quantite_retournable,
                        })}
                      </option>
                    ))}
                </select>
              </label>
              <label className="text-xs font-medium text-text-secondary">
                {t("retour.quantite_label")}
                <input
                  type="number"
                  min={1}
                  max={ligneRetourSelectionnee?.quantite_retournable ?? 1}
                  value={quantiteRetour}
                  onChange={(e) => setQuantiteRetour(Number(e.target.value))}
                  className="mt-1 w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
                />
              </label>
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
                disabled={
                  !ligneRetourId ||
                  quantiteRetour < 1 ||
                  quantiteRetour > (ligneRetourSelectionnee?.quantite_retournable ?? 0) ||
                  creerRetourMutation.isPending ||
                  !modifiable
                }
                title={!modifiable ? t("common:acces.lecture_seule_tooltip") ?? "" : ""}
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
