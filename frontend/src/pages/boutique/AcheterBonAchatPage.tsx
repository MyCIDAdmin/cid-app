/**
 * Page membre "Boutique — Acheter un bon d'achat" (demande utilisateur du 2026-09-23 : "Es soll
 * möglich sein Gutscheine zu Kaufen. Diese sollen als Gutscheincodes im shop verwenden werden.
 * Der Code soll in einer schönen Email... geschickt werden").
 *
 * Montant librement choisi par l'acheteur (choix confirmé, voir bon_achat_montant_min/max côté
 * backend — bornes affichées ici uniquement à titre indicatif, le serveur reste seul juge :
 * CLAUDE.md §8). Une fois acheté, le bon est créé `en_attente` : mêmes instructions de paiement
 * hors ligne (virement SEPA / PayPal manuel) que PanierCommandePage — voir sa docstring "PAUSE DU
 * PAIEMENT EN LIGNE" pour le contexte (PAIEMENT_EN_LIGNE_ACTIF=false, même principe ici). Le code
 * n'est communiqué par email qu'une fois le paiement confirmé manuellement par le Directeur
 * Financier (GestionBonsAchatTab) — cette page affiche donc "en attente de confirmation", jamais
 * le code lui-même.
 */
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import PaymentInstructions from "../../components/ui/PaymentInstructions";
import { useAcheterBonAchat } from "../../hooks/useBoutique";
import type { BonAchat } from "../../types/boutique";
import { extractApiErrorMessage } from "../../utils/apiError";

const MONTANT_MIN = 5;
const MONTANT_MAX = 500;
const MONTANTS_SUGGERES = [10, 25, 50, 100];

function formatMontant(montant: number | string): string {
  return `${Number(montant).toFixed(2).replace(".", ",")} €`;
}

export default function AcheterBonAchatPage() {
  const { t } = useTranslation("boutique");
  const acheterMutation = useAcheterBonAchat();

  const [montant, setMontant] = useState("25.00");
  const [bonAchete, setBonAchete] = useState<BonAchat | null>(null);

  function handleAcheter(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    acheterMutation.mutate({ montant }, { onSuccess: setBonAchete });
  }

  if (bonAchete) {
    return (
      <div className="mx-auto max-w-md rounded-cid-lg bg-bg-primary p-6 text-center shadow-sm">
        <div className="mb-3 text-4xl">🎁</div>
        <h1 className="mb-2 text-lg font-bold text-text-primary">
          {t("bon_achat_acheter.confirme_titre")}
        </h1>
        <p className="mb-1 text-sm text-text-secondary">
          {t("bon_achat_acheter.confirme_montant", {
            montant: formatMontant(bonAchete.montant_initial),
          })}
        </p>
        <p className="mb-5 text-xs text-text-tertiary">{t("bon_achat_acheter.confirme_note")}</p>

        <div className="mb-5 rounded-cid border border-text-tertiary/10 p-4 text-left">
          <h2 className="mb-1 text-xs font-bold text-text-primary">
            {t("commande.payer_hors_ligne_titre")}
          </h2>
          <p className="mb-3 text-xs text-text-tertiary">{t("commande.payer_hors_ligne_note")}</p>
          <div className="flex flex-col gap-2">
            <PaymentInstructions mode="virement_sepa" />
            <PaymentInstructions mode="paypal" />
          </div>
        </div>

        <div className="flex flex-col items-center gap-2">
          <Link
            to="/boutique/bons-achat"
            className="rounded-cid bg-ca px-4 py-2 text-sm font-medium text-white hover:bg-cad"
          >
            {t("bon_achat_acheter.voir_mes_bons")}
          </Link>
          <Link to="/boutique" className="text-sm font-medium text-ca hover:underline">
            {t("commande.retour_catalogue")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-4 text-xl font-bold text-text-primary">{t("bon_achat_acheter.titre")}</h1>
      <p className="mb-4 text-sm text-text-secondary">{t("bon_achat_acheter.description")}</p>

      <form
        onSubmit={handleAcheter}
        className="rounded-cid-lg bg-bg-primary p-4 shadow-sm"
      >
        <label
          htmlFor="bon-montant"
          className="mb-1 block text-xs font-medium text-text-secondary"
        >
          {t("bon_achat_acheter.montant_label", { min: MONTANT_MIN, max: MONTANT_MAX })}
        </label>
        <input
          id="bon-montant"
          type="number"
          min={MONTANT_MIN}
          max={MONTANT_MAX}
          step="0.01"
          required
          value={montant}
          onChange={(e) => setMontant(e.target.value)}
          className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
        />

        <div className="mt-2 flex flex-wrap gap-2">
          {MONTANTS_SUGGERES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMontant(m.toFixed(2))}
              className={`rounded-cid px-3 py-1 text-xs font-medium ${
                Number(montant) === m
                  ? "bg-ca text-white"
                  : "bg-bg-tertiary text-text-secondary hover:bg-bg-tertiary/70"
              }`}
            >
              {formatMontant(m)}
            </button>
          ))}
        </div>

        {acheterMutation.isError && (
          <p className="mt-3 text-xs text-status-dangerText">
            {extractApiErrorMessage(acheterMutation.error, t("bon_achat_acheter.erreur"))}
          </p>
        )}

        <button
          type="submit"
          disabled={
            acheterMutation.isPending ||
            !montant ||
            Number(montant) < MONTANT_MIN ||
            Number(montant) > MONTANT_MAX
          }
          className="mt-4 w-full rounded-cid bg-ca px-3 py-2 text-sm font-medium text-white hover:bg-cad disabled:opacity-40"
        >
          {acheterMutation.isPending
            ? t("bon_achat_acheter.en_cours")
            : t("bon_achat_acheter.acheter")}
        </button>
      </form>
    </div>
  );
}
