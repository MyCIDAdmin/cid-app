/**
 * File de validation des justificatifs de rabais — vue RH+ (mockup #pg-admin-adhesion section
 * "Justificatifs", FDD §4.5, RICEFW R-ADH-05, AHM-20).
 *
 * Réutilise GET /adhesions/souscriptions/?statut=en_attente_justificatif plutôt que
 * GET /adhesions/justificatifs/ : voir le commentaire de
 * adhesionsApi.listSouscriptionsEnAttenteJustificatif pour la raison (JustificatifRabaisSerializer
 * seul ne porte ni le membre ni l'offre/le rabais, nécessaires pour un affichage utile de la
 * file). Chaque ligne résout le nom du membre via useMembre(souscription.membre) — un composant
 * séparé par ligne (JustificatifQueueRow) pour respecter les règles des Hooks (pas d'appel de
 * hook dans une boucle).
 *
 * Le fichier lui-même ne s'obtient jamais autrement que via l'action "telecharger" (URL MinIO
 * pré-signée, TTL 15 min, voir JustificatifRabaisSerializer côté backend) — jamais stocké ni
 * affiché en clair ici.
 *
 * Deux capacités ajoutées le 2026-09-16 (demande utilisateur) :
 *  - upload "pour le compte d'un membre" quand justificatif est encore null (réutilise
 *    useUploaderJustificatif, déjà utilisé côté membre sur MonAdhesionPage — c'est le backend qui
 *    autorise l'upload par un RH+ pour une souscription qui n'est pas la sienne, voir
 *    JustificatifRabaisViewSet.create) ;
 *  - annulation ("stornieren") de la souscription elle-même, indépendamment de la décision sur le
 *    justificatif — toutes les souscriptions de cette file sont "en_attente_justificatif", donc
 *    toujours annulables (voir STATUTS_SOUSCRIPTION_ANNULABLES côté backend).
 *
 * Lecture seule (task #216, 2026-09-24) : "page_justificatifs" ne couvre QUE la décision de
 * validation elle-même (approuver/rejeter, toutes deux via `useValiderJustificatif`) — `modifiable`
 * (voir usePageAccess ci-dessous) gate donc uniquement ces deux actions. L'upload "pour le compte
 * d'un membre" et l'annulation de souscription restent volontairement hors périmètre de cette
 * matrice (portée acceptée avec l'utilisateur pour task #216) et ne sont pas gatés ici.
 */
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { telechargerJustificatif } from "../../api/adhesions";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import { useMembre } from "../../hooks/useMembres";
import {
  useAnnulerSouscription,
  useCampagnes,
  useHistoriqueJustificatifs,
  useJustificatifsEnAttente,
  useUploaderJustificatif,
  useValiderJustificatif,
} from "../../hooks/useAdhesions";
import { usePageAccess } from "../../hooks/useRbac";
import type { CampagneAdhesion, Souscription } from "../../types/adhesion";
import { extractApiErrorMessage } from "../../utils/apiError";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

interface JustificatifQueueRowProps {
  souscription: Souscription;
  campagnesById: Map<string, CampagneAdhesion>;
  modifiable: boolean;
}

function JustificatifQueueRow({
  souscription,
  campagnesById,
  modifiable,
}: JustificatifQueueRowProps) {
  const { t } = useTranslation(["adhesions", "common"]);
  const membre = useMembre(souscription.membre);
  const validerMutation = useValiderJustificatif();
  const uploaderMutation = useUploaderJustificatif();
  const annulerMutation = useAnnulerSouscription();

  const [rejetOuvert, setRejetOuvert] = useState(false);
  const [motifRejet, setMotifRejet] = useState("");
  const [telechargementEnCours, setTelechargementEnCours] = useState(false);
  const [erreurTelechargement, setErreurTelechargement] = useState<string | null>(null);
  const [annulationOuverte, setAnnulationOuverte] = useState(false);
  const fichierInputRef = useRef<HTMLInputElement>(null);

  const campagne = campagnesById.get(souscription.campagne);
  const offre = campagne?.offres.find((o) => o.id === souscription.offre);
  const rabais = offre?.rabais.find((r) => r.id === souscription.rabais);
  const justificatif = souscription.justificatif;

  function handleFichierChoisi(fichier: File | undefined) {
    if (!fichier) return;
    uploaderMutation.mutate({ souscriptionId: souscription.id, fichier });
  }

  function confirmerAnnulation() {
    annulerMutation.mutate(souscription.id, { onSuccess: () => setAnnulationOuverte(false) });
  }

  async function voirJustificatif() {
    if (!justificatif) return;
    setErreurTelechargement(null);
    setTelechargementEnCours(true);
    try {
      const { url } = await telechargerJustificatif(justificatif.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setErreurTelechargement(extractApiErrorMessage(error, t("admin_justificatifs.erreur_voir")));
    } finally {
      setTelechargementEnCours(false);
    }
  }

  function approuver() {
    if (!justificatif) return;
    validerMutation.mutate({ id: justificatif.id, payload: { decision: "approuve" } });
  }

  function confirmerRejet() {
    if (!justificatif || !motifRejet.trim()) return;
    validerMutation.mutate(
      { id: justificatif.id, payload: { decision: "rejete", motif_rejet: motifRejet.trim() } },
      { onSuccess: () => setRejetOuvert(false) },
    );
  }

  return (
    <tr className="border-b border-text-tertiary/10 last:border-0 align-top">
      <td className="px-4 py-2">
        {formatDate(justificatif?.created_at ?? souscription.date_souscription)}
      </td>
      <td className="px-4 py-2">
        {membre.isLoading
          ? t("admin_justificatifs.chargement")
          : membre.data
            ? `${membre.data.prenom} ${membre.data.nom} (${membre.data.numero_membre})`
            : "—"}
      </td>
      <td className="px-4 py-2">{offre?.nom ?? "—"}</td>
      <td className="px-4 py-2">{rabais?.label_fr ?? "—"}</td>
      <td className="px-4 py-2">
        {justificatif ? (
          <button
            type="button"
            onClick={voirJustificatif}
            disabled={telechargementEnCours}
            className="font-medium text-ca hover:underline disabled:opacity-40"
          >
            {telechargementEnCours
              ? t("admin_justificatifs.telechargement_en_cours")
              : t("admin_justificatifs.voir")}
          </button>
        ) : (
          <div className="space-y-1">
            <input
              ref={fichierInputRef}
              type="file"
              aria-label={`${t("admin_justificatifs.uploader_pour_membre")} — ${offre?.nom ?? ""}`}
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => handleFichierChoisi(e.target.files?.[0])}
              disabled={uploaderMutation.isPending}
              className="text-[11px]"
            />
            {uploaderMutation.isError && (
              <p className="text-xs text-status-dangerText">
                {extractApiErrorMessage(
                  uploaderMutation.error,
                  t("admin_justificatifs.erreur_upload"),
                )}
              </p>
            )}
          </div>
        )}
        {erreurTelechargement && (
          <p className="mt-1 text-xs text-status-dangerText">{erreurTelechargement}</p>
        )}
      </td>
      <td className="px-4 py-2">
        <div className="space-y-1.5">
          {justificatif && (
            <>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={approuver}
                  disabled={validerMutation.isPending || !modifiable}
                  title={!modifiable ? (t("common:acces.lecture_seule_tooltip") ?? "") : ""}
                  className="rounded-cid bg-status-successText px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
                >
                  {t("admin_justificatifs.approuver")}
                </button>
                <button
                  type="button"
                  onClick={() => setRejetOuvert((cur) => !cur)}
                  disabled={!modifiable}
                  title={!modifiable ? (t("common:acces.lecture_seule_tooltip") ?? "") : ""}
                  className="rounded-cid px-2 py-1 text-xs text-status-dangerText hover:bg-status-dangerBg disabled:opacity-40"
                >
                  {t("admin_justificatifs.rejeter")}
                </button>
              </div>
              {rejetOuvert && (
                <div className="w-56">
                  <textarea
                    rows={2}
                    value={motifRejet}
                    onChange={(e) => setMotifRejet(e.target.value)}
                    placeholder={t("admin_justificatifs.motif_placeholder")}
                    className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={confirmerRejet}
                    disabled={!motifRejet.trim() || validerMutation.isPending || !modifiable}
                    title={!modifiable ? (t("common:acces.lecture_seule_tooltip") ?? "") : ""}
                    className="mt-1 rounded-cid bg-status-dangerText px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
                  >
                    {t("admin_justificatifs.confirmer_rejet")}
                  </button>
                </div>
              )}
              {validerMutation.isError && (
                <p className="text-xs text-status-dangerText">
                  {extractApiErrorMessage(
                    validerMutation.error,
                    t("admin_justificatifs.erreur_action"),
                  )}
                </p>
              )}
            </>
          )}
          <button
            type="button"
            onClick={() => setAnnulationOuverte(true)}
            className="text-xs text-text-tertiary hover:text-status-dangerText hover:underline"
          >
            {t("admin_justificatifs.annuler_souscription")}
          </button>
          {annulerMutation.isError && (
            <p className="text-xs text-status-dangerText">
              {extractApiErrorMessage(
                annulerMutation.error,
                t("admin_justificatifs.erreur_annulation"),
              )}
            </p>
          )}
        </div>
        <ConfirmDialog
          open={annulationOuverte}
          title={t("admin_justificatifs.confirmer_annuler_titre")}
          message={t("admin_justificatifs.confirmer_annuler_message")}
          danger
          onConfirm={confirmerAnnulation}
          onCancel={() => setAnnulationOuverte(false)}
        />
      </td>
    </tr>
  );
}

/** Ligne d'historique (point 6, 2026-10-06) : dates de dépôt et de décision protocolées. */
function JustificatifHistoriqueRow({
  souscription,
  campagnesById,
}: {
  souscription: Souscription;
  campagnesById: Map<string, CampagneAdhesion>;
}) {
  const { t } = useTranslation("adhesions");
  const membre = useMembre(souscription.membre);
  const offre = campagnesById
    .get(souscription.campagne)
    ?.offres.find((o) => o.id === souscription.offre);
  const justificatif = souscription.justificatif;
  if (!justificatif) return null;
  return (
    <tr className="border-b border-text-tertiary/10 last:border-0">
      <td className="px-4 py-2">{new Date(justificatif.created_at).toLocaleString()}</td>
      <td className="px-4 py-2">
        {justificatif.date_decision ? new Date(justificatif.date_decision).toLocaleString() : "—"}
      </td>
      <td className="px-4 py-2">
        {membre.data ? `${membre.data.prenom} ${membre.data.nom}` : "—"}
      </td>
      <td className="px-4 py-2">{offre?.nom ?? "—"}</td>
      <td className="px-4 py-2">{t(`admin_justificatifs.statut_${justificatif.statut}`)}</td>
      <td className="px-4 py-2 text-xs text-text-tertiary">{justificatif.motif_rejet || "—"}</td>
    </tr>
  );
}

function HistoriqueJustificatifs({
  campagnesById,
}: {
  campagnesById: Map<string, CampagneAdhesion>;
}) {
  const { t } = useTranslation("adhesions");
  const historique = useHistoriqueJustificatifs();
  const lignes = historique.data?.results ?? [];
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-bold text-text-primary">
        {t("admin_justificatifs.historique_titre")}
      </h2>
      <div className="overflow-x-auto rounded-cid-lg bg-bg-primary shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-text-tertiary/20 text-left text-xs font-semibold uppercase text-text-tertiary">
              <th className="px-4 py-2">{t("admin_justificatifs.col_depose_le")}</th>
              <th className="px-4 py-2">{t("admin_justificatifs.col_decide_le")}</th>
              <th className="px-4 py-2">{t("admin_justificatifs.col_membre")}</th>
              <th className="px-4 py-2">{t("admin_justificatifs.col_offre")}</th>
              <th className="px-4 py-2">{t("admin_justificatifs.col_statut")}</th>
              <th className="px-4 py-2">{t("admin_justificatifs.col_motif")}</th>
            </tr>
          </thead>
          <tbody>
            {historique.data && lignes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-text-tertiary">
                  {t("admin_justificatifs.historique_vide")}
                </td>
              </tr>
            )}
            {lignes.map((s) => (
              <JustificatifHistoriqueRow
                key={s.id}
                souscription={s}
                campagnesById={campagnesById}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function AdminJustificatifsPage() {
  const { t } = useTranslation(["adhesions", "common"]);
  // Task #216 (2026-09-24) — voir docstring de tête pour le périmètre exact (uniquement
  // approuver/rejeter, cf. JustificatifQueueRow).
  const { accessible, modifiable } = usePageAccess("page_justificatifs");

  const enAttente = useJustificatifsEnAttente();
  // Catalogue complet pour résoudre les noms d'offre/rabais (mêmes limites que
  // MonAdhesionPage.campagnesById : première page du cursor seulement).
  const campagnesQuery = useCampagnes();

  const campagnesById = useMemo(() => {
    const map = new Map<string, CampagneAdhesion>();
    campagnesQuery.data?.results.forEach((c) => map.set(c.id, c));
    return map;
  }, [campagnesQuery.data]);

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-text-primary">{t("admin_justificatifs.titre")}</h1>
      <p className="mb-4 text-sm text-text-tertiary">{t("admin_justificatifs.sous_titre")}</p>

      {accessible && !modifiable && (
        <div className="mb-4 rounded-cid border border-status-warningText/30 bg-status-warningBg px-3 py-2 text-sm text-status-warningText">
          {t("common:acces.lecture_seule_banniere")}
        </div>
      )}

      <div className="overflow-x-auto rounded-cid-lg bg-bg-primary shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-text-tertiary/20 text-left text-xs font-semibold uppercase text-text-tertiary">
              <th className="px-4 py-2">{t("admin_justificatifs.col_date")}</th>
              <th className="px-4 py-2">{t("admin_justificatifs.col_membre")}</th>
              <th className="px-4 py-2">{t("admin_justificatifs.col_offre")}</th>
              <th className="px-4 py-2">{t("admin_justificatifs.col_rabais")}</th>
              <th className="px-4 py-2">{t("admin_justificatifs.col_document")}</th>
              <th className="px-4 py-2">{t("admin_justificatifs.col_actions")}</th>
            </tr>
          </thead>
          <tbody>
            {enAttente.isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-text-tertiary">
                  {t("admin_justificatifs.chargement")}
                </td>
              </tr>
            )}
            {enAttente.isError && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-status-dangerText">
                  {t("admin_justificatifs.erreur_chargement")}
                </td>
              </tr>
            )}
            {enAttente.data && enAttente.data.results.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-text-tertiary">
                  {t("admin_justificatifs.aucun")}
                </td>
              </tr>
            )}
            {enAttente.data?.results.map((s) => (
              <JustificatifQueueRow
                key={s.id}
                souscription={s}
                campagnesById={campagnesById}
                modifiable={modifiable}
              />
            ))}
          </tbody>
        </table>
      </div>

      <HistoriqueJustificatifs campagnesById={campagnesById} />
    </div>
  );
}
