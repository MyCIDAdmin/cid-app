/**
 * Validation des inscriptions libre-service par RH/Admin (AHM-48, FDD §3.1).
 * Route gated RH+ par RequireRole (même niveau que PendingRegistrationsView
 * côté backend). Accepter active le compte immédiatement ; la création/
 * liaison de la fiche Membre reste un geste séparé via /membres/nouveau
 * (MembreSerializer expose déjà un champ `user` éditable) — hors périmètre
 * de ce ticket.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import ConfirmDialog from "../../components/ui/ConfirmDialog";
import {
  useApproveRegistration,
  usePendingRegistrations,
  useRefuseRegistration,
} from "../../hooks/useInscriptions";
import { extractApiErrorMessage } from "../../utils/apiError";

type Decision = { id: string; email: string; type: "approuver" | "refuser" };

export default function InscriptionsEnAttentePage() {
  const { t } = useTranslation("inscriptions");

  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<Decision | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [messageAccepte, setMessageAccepte] = useState<string | null>(null);

  const { data, isLoading, isError } = usePendingRegistrations(pageUrl);
  const approveMutation = useApproveRegistration();
  const refuseMutation = useRefuseRegistration();

  function confirmerDecision() {
    if (!enCours) return;
    setErreur(null);
    const mutation = enCours.type === "approuver" ? approveMutation : refuseMutation;
    mutation.mutate(enCours.id, {
      onSuccess: () => {
        if (enCours.type === "approuver") {
          setMessageAccepte(t("liste.accepte_message", { email: enCours.email }));
        }
        setEnCours(null);
      },
      onError: (error) => {
        setErreur(extractApiErrorMessage(error, t("liste.erreur_action")));
        setEnCours(null);
      },
    });
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-text-primary">{t("liste.titre")}</h1>
      <p className="mb-4 text-sm text-text-secondary">{t("liste.description")}</p>

      {messageAccepte && (
        <div className="mb-4 rounded-cid border border-status-successText/30 bg-status-successBg px-3 py-2 text-sm text-status-successText">
          {messageAccepte}{" "}
          <Link to="/membres/nouveau" className="font-medium underline">
            {t("liste.creer_fiche_membre")}
          </Link>
        </div>
      )}
      {erreur && (
        <p className="mb-4 rounded-cid border border-status-dangerText/30 bg-status-dangerBg px-3 py-2 text-sm text-status-dangerText">
          {erreur}
        </p>
      )}

      <div className="overflow-x-auto rounded-cid-lg bg-bg-primary shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-text-tertiary/20 text-left text-xs font-semibold uppercase text-text-tertiary">
              <th className="px-4 py-2">{t("liste.col_email")}</th>
              <th className="px-4 py-2">{t("liste.col_langue")}</th>
              <th className="px-4 py-2">{t("liste.col_date")}</th>
              <th className="px-4 py-2">{t("liste.col_actions")}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-text-tertiary">
                  {t("liste.chargement")}
                </td>
              </tr>
            )}
            {isError && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-status-dangerText">
                  {t("liste.erreur_chargement")}
                </td>
              </tr>
            )}
            {!isLoading && !isError && data?.results.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-text-tertiary">
                  {t("liste.aucune_inscription")}
                </td>
              </tr>
            )}
            {data?.results.map((inscription) => (
              <tr key={inscription.id} className="border-b border-text-tertiary/10 last:border-0">
                <td className="px-4 py-2 font-medium text-text-primary">{inscription.email}</td>
                <td className="px-4 py-2 uppercase text-text-secondary">
                  {inscription.langue_preferee}
                </td>
                <td className="px-4 py-2 text-text-secondary">
                  {new Date(inscription.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-2">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setEnCours({ id: inscription.id, email: inscription.email, type: "approuver" })
                      }
                      className="rounded-cid bg-ca px-2 py-1 text-xs font-medium text-white hover:bg-cad"
                    >
                      {t("liste.accepter")}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setEnCours({ id: inscription.id, email: inscription.email, type: "refuser" })
                      }
                      className="rounded-cid px-2 py-1 text-xs text-status-dangerText hover:bg-status-dangerBg"
                    >
                      {t("liste.refuser")}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          disabled={!data?.previous}
          onClick={() => setPageUrl(data?.previous ?? null)}
          className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary disabled:opacity-40"
        >
          {t("liste.precedent")}
        </button>
        <button
          type="button"
          disabled={!data?.next}
          onClick={() => setPageUrl(data?.next ?? null)}
          className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary disabled:opacity-40"
        >
          {t("liste.suivant")}
        </button>
      </div>

      <ConfirmDialog
        open={enCours !== null}
        title={
          enCours?.type === "approuver" ? t("liste.confirmer_accepter_titre") : t("liste.confirmer_refuser_titre")
        }
        message={t(
          enCours?.type === "approuver" ? "liste.confirmer_accepter_message" : "liste.confirmer_refuser_message",
          { email: enCours?.email },
        )}
        danger={enCours?.type === "refuser"}
        onConfirm={confirmerDecision}
        onCancel={() => setEnCours(null)}
      />
    </div>
  );
}
