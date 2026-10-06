/**
 * Zahlungen aus dem Shop im Modul "Zahlungen" (demande utilisateur du 2026-10-05, point 5 :
 * "Die Zahlungen vom Shop sollen im Modul Zahlung auftauchen"). Même principe que
 * `TippspielZahlungenPanel` : une Commande boutique reste un système de paiement distinct du
 * modèle `Cotisation`, d'où une section à part affichée au même endroit.
 * Liste via GET /boutique/commandes/ (Bureau Admin+ voit toutes les commandes, voir
 * CommandeViewSet.get_queryset) ; confirmation via POST .../confirmer-paiement/ (Directeur
 * Financier+, contrôlé côté serveur — le bouton n'est qu'un raccourci d'affichage).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { telechargerFactureCommande } from "../../api/boutique";
import { useCommandes, useConfirmerPaiementCommande } from "../../hooks/useBoutique";
import BelegButton from "./BelegButton";
import { hasRoleAtLeast, ROLE_LEVELS, useAuthStore } from "../../store/authStore";
import type { ModePaiementCommande } from "../../types/boutique";
import { extractApiErrorMessage } from "../../utils/apiError";
import InfoTip from "../ui/InfoTip";

const MODES_CONFIRMATION: ModePaiementCommande[] = ["virement", "especes", "en_ligne"];

function formatMontant(montant: string): string {
  return `${Number(montant).toFixed(2).replace(".", ",")} €`;
}

export default function ShopZahlungenPanel() {
  const { t } = useTranslation(["cotisations", "boutique"]);
  const user = useAuthStore((s) => s.user);
  const peutVoir = hasRoleAtLeast(user, ROLE_LEVELS.bureau_admin);
  const peutConfirmer = hasRoleAtLeast(user, ROLE_LEVELS.dir_financier);

  const commandesQuery = useCommandes({});
  const confirmer = useConfirmerPaiementCommande();
  const [modes, setModes] = useState<Record<string, ModePaiementCommande>>({});
  const [erreur, setErreur] = useState("");

  if (!peutVoir) return null;

  const lignes = commandesQuery.data?.results ?? [];

  return (
    <div className="mb-4 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
      <h2 className="text-sm font-bold text-text-primary">{t("shop_zahlungen.titre")}</h2>
      <p className="mb-3 text-xs text-text-tertiary">{t("shop_zahlungen.sous_titre")}</p>

      {commandesQuery.isLoading && (
        <p className="text-sm text-text-tertiary">{t("shop_zahlungen.chargement")}</p>
      )}
      {commandesQuery.isError && (
        <p className="text-sm text-status-dangerText">{t("shop_zahlungen.erreur")}</p>
      )}
      {commandesQuery.data && lignes.length === 0 && (
        <p className="text-sm text-text-tertiary">{t("shop_zahlungen.vide")}</p>
      )}

      {lignes.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-text-tertiary/20 text-left text-xs font-semibold uppercase text-text-tertiary">
                <th className="px-3 py-2">{t("shop_zahlungen.commande")}</th>
                <th className="px-3 py-2">{t("shop_zahlungen.client")}</th>
                <th className="px-3 py-2">{t("shop_zahlungen.montant")}</th>
                <th className="px-3 py-2">{t("shop_zahlungen.statut")}</th>
                <th className="px-3 py-2">{t("shop_zahlungen.paiement")}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {lignes.map((c) => {
                const aConfirmer = c.statut === "en_attente" && !c.date_paiement_confirme;
                return (
                  <tr key={c.id} className="border-b border-text-tertiary/10 last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">{c.numero_commande}</td>
                    <td className="px-3 py-2">{c.nom_destinataire}</td>
                    <td className="px-3 py-2 font-semibold text-ca">
                      {formatMontant(c.montant_total)}
                    </td>
                    <td className="px-3 py-2">{t(`boutique:statut_commande.${c.statut}`)}</td>
                    <td className="px-3 py-2 text-xs">
                      {c.date_paiement_confirme
                        ? `${c.mode_paiement ? t(`boutique:paiement.mode.${c.mode_paiement}`) : ""} · ${new Date(c.date_paiement_confirme).toLocaleDateString()}`
                        : t("shop_zahlungen.non_paye")}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {c.date_paiement_confirme && (
                        <BelegButton
                          holen={() => telechargerFactureCommande(c.id)}
                          dateiname={`rechnung-${c.numero_commande}.pdf`}
                          label={t("shop_zahlungen.rechnung")}
                        />
                      )}
                      {aConfirmer && peutConfirmer && (
                        <div className="flex items-center justify-end gap-2">
                          <select
                            aria-label={t("shop_zahlungen.mode")}
                            value={modes[c.id] ?? "virement"}
                            onChange={(e) =>
                              setModes((m) => ({
                                ...m,
                                [c.id]: e.target.value as ModePaiementCommande,
                              }))
                            }
                            className="rounded-cid border border-text-tertiary/30 bg-bg-primary px-1 py-0.5 text-xs"
                          >
                            {MODES_CONFIRMATION.map((mode) => (
                              <option key={mode} value={mode}>
                                {t(`boutique:paiement.mode.${mode}`)}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={confirmer.isPending}
                            onClick={() => {
                              setErreur("");
                              confirmer.mutate(
                                {
                                  id: c.id,
                                  payload: { mode_paiement: modes[c.id] ?? "virement" },
                                },
                                {
                                  onError: (err) =>
                                    setErreur(
                                      extractApiErrorMessage(err, t("shop_zahlungen.erreur")),
                                    ),
                                },
                              );
                            }}
                            className="rounded-cid bg-ca px-2.5 py-1 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
                          >
                            {t("shop_zahlungen.confirmer")}
                          </button>
                          <InfoTip k="shop_bestaetigen" />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {erreur && <p className="mt-2 text-xs text-status-dangerText">{erreur}</p>}
    </div>
  );
}
