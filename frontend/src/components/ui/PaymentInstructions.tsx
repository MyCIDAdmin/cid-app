/**
 * Instructions de paiement hors ligne (virement SEPA / PayPal "Amis & Famille") — retour
 * utilisateur du 2026-09-19 : le paiement en ligne réel (Stripe/PayPal Checkout, webhooks,
 * initier-paiement-en-ligne, voir AHM-46) reste entièrement implémenté côté backend pour une
 * activation future, mais n'est plus proposé aux membres pour le moment. Seuls le virement SEPA
 * et un envoi PayPal manuel sont proposés, tous deux confirmés manuellement par le Directeur
 * Financier (CotisationsEnAttentePage / CommandeViewSet.confirmer_paiement, déjà existants —
 * aucun changement backend nécessaire pour cette confirmation manuelle).
 *
 * Coordonnées de l'association : constantes volontairement en dur ici (pas de valeur secrète,
 * voir CLAUDE.md §5 — c'est une information publique destinée à être communiquée aux membres) et
 * identiques dans toutes les langues, seuls les libellés autour sont traduits (namespace
 * "common", clé paiement_instructions.*).
 */
import { useTranslation } from "react-i18next";

const COMPTE_BANCAIRE = {
  titulaire: "Clubistes in Deutschland e.V.",
  iban: "DE38 1009 000 2891 4900 06",
};

const COMPTE_PAYPAL = {
  email: "info@clubistesindeutschland.org",
};

interface PaymentInstructionsProps {
  mode: "virement_sepa" | "paypal";
  className?: string;
}

export default function PaymentInstructions({ mode, className = "" }: PaymentInstructionsProps) {
  const { t } = useTranslation("common");

  if (mode === "virement_sepa") {
    return (
      <div
        className={`rounded-cid border border-text-tertiary/20 bg-bg-tertiary/40 p-3 text-xs ${className}`}
      >
        <div className="mb-1 font-semibold text-text-primary">
          {t("paiement_instructions.virement_titre")}
        </div>
        <div className="text-text-secondary">{COMPTE_BANCAIRE.titulaire}</div>
        <div className="font-mono text-sm text-text-primary">{COMPTE_BANCAIRE.iban}</div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-cid border border-text-tertiary/20 bg-bg-tertiary/40 p-3 text-xs ${className}`}
    >
      <div className="mb-1 font-semibold text-text-primary">
        {t("paiement_instructions.paypal_titre")}
      </div>
      <div className="font-mono text-sm text-text-primary">{COMPTE_PAYPAL.email}</div>
      <div className="mt-1 text-status-warningText">{t("paiement_instructions.paypal_note")}</div>
    </div>
  );
}
