/**
 * Confirmation des paiements de participation au Tippspiel — vue Directeur Financier+
 * (module "Ausstehende Zahlungen", `CotisationsEnAttentePage.tsx`).
 *
 * Déplacé ici le 2026-09-24 depuis le module Fan-Club (`TippspielSection.tsx`, où vivait
 * l'ancien `ZahlungenPanel`) suite au retour utilisateur : "Die Ausstehende Zahlung für
 * die Teilnahme im Tippspiel soll im Modul 'Ausstehende Zahlungen' auftauchen und
 * genehmigt werden und nicht im Fan-Club Modul". La `TippspielTeilnahme` reste un
 * système de paiement autonome, distinct du modèle `Cotisation` qui structure le reste
 * de cette page (décision utilisateur d'origine : "Eigenständiges einfaches System") —
 * ce panneau est donc une section à part, pas une ligne de plus dans le tableau des
 * cotisations, mais affichée au même endroit ("im Modul 'Ausstehende Zahlungen'").
 *
 * Liste désormais TOUS les Tippspiele confondus (`?statut_paiement=en_attente` sans
 * `?tippspiel=`, voir TippspielTeilnahmeViewSet.get_queryset côté backend) — ce module
 * ne connaît pas à l'avance l'id du Tippspiel en cours, contrairement à l'ancien
 * emplacement qui l'avait toujours sous la main.
 *
 * Visibilité alignée sur le contrôle serveur réel de cette fonctionnalité
 * (`DIR_FINANCIER_MIN_LEVEL` dans TippspielTeilnahmeViewSet), pas sur
 * `usePageAccess("page_cotisations_attente")` (matrice RBAC par page, propre au module
 * Cotisations) — le Tippspiel n'a jamais été migré vers cette matrice, voir
 * TippspielPermission côté backend.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useConfirmerPaiementTeilnahme, useTippspielTeilnahmen } from "../../hooks/useCommunaute";
import { hasRoleAtLeast, ROLE_LEVELS, useAuthStore } from "../../store/authStore";
import { extractApiErrorMessage } from "../../utils/apiError";

function formatMontant(montant: string | null): string {
  if (montant === null) return "—";
  return `${Number(montant).toFixed(2).replace(".", ",")} €`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export default function TippspielZahlungenPanel() {
  const { t } = useTranslation("communaute");
  const user = useAuthStore((s) => s.user);
  const peutBestaetigen = hasRoleAtLeast(user, ROLE_LEVELS.dir_financier);

  const enAttenteQuery = useTippspielTeilnahmen({ statutPaiement: "en_attente" });
  const confirmer = useConfirmerPaiementTeilnahme();
  const [erreur, setErreur] = useState("");

  if (!peutBestaetigen) return null;

  const lignes = enAttenteQuery.data?.results ?? [];

  return (
    <div className="mb-4 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
      <h2 className="text-sm font-bold text-text-primary">{t("tippspiel.zahlungen_titel")}</h2>
      <p className="mb-3 text-xs text-text-tertiary">{t("tippspiel.zahlungen_untertitel")}</p>

      {enAttenteQuery.isLoading && (
        <p className="text-sm text-text-tertiary">{t("tippspiel.chargement")}</p>
      )}
      {enAttenteQuery.isError && (
        <p className="text-sm text-status-dangerText">{t("tippspiel.zahlungen_fehler")}</p>
      )}
      {enAttenteQuery.data && lignes.length === 0 && (
        <p className="text-sm text-text-tertiary">{t("tippspiel.zahlungen_leer")}</p>
      )}

      {lignes.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-text-tertiary/20 text-left text-xs font-semibold uppercase text-text-tertiary">
                <th className="px-3 py-2">{t("tippspiel.zahlungen_spalte_mitglied")}</th>
                <th className="px-3 py-2">{t("tippspiel.zahlungen_spalte_spiel")}</th>
                <th className="px-3 py-2">{t("tippspiel.zahlungen_spalte_betrag")}</th>
                <th className="px-3 py-2">{t("tippspiel.zahlungen_spalte_datum")}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {lignes.map((ligne) => (
                <tr key={ligne.id} className="border-b border-text-tertiary/10 last:border-0">
                  <td className="px-3 py-2">{ligne.membre_nom}</td>
                  <td className="px-3 py-2">{ligne.tippspiel_titre}</td>
                  <td className="px-3 py-2 font-semibold text-ca">
                    {formatMontant(ligne.montant_participation)}
                  </td>
                  <td className="px-3 py-2">{formatDate(ligne.created_at)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      disabled={confirmer.isPending}
                      onClick={() => {
                        setErreur("");
                        confirmer.mutate(ligne.id, {
                          onError: (err) =>
                            setErreur(extractApiErrorMessage(err, t("tippspiel.zahlungen_fehler"))),
                        });
                      }}
                      className="rounded-cid bg-ca px-2.5 py-1 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
                    >
                      {t("tippspiel.zahlungen_bestaetigen")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {erreur && <p className="mt-2 text-xs text-status-dangerText">{erreur}</p>}
    </div>
  );
}
