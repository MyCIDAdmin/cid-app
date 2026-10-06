/**
 * Zahlungsinfo-Fenster nach der Anmeldung zu einem Mitgliedschaftsangebot (Nutzerwunsch vom
 * 2026-10-06 : "wie beim Shop") — gleiche Bankverbindung/PayPal-Hinweise wie die Shop-
 * Bestellbestätigung (components/ui/PaymentInstructions), zusätzlich mit Betrag und
 * Verwendungszweck. Das Fenster ist rein informativ ; der Finanzverantwortliche bestätigt den
 * Zahlungseingang weiterhin manuell (CotisationsEnAttentePage).
 */
import { useTranslation } from "react-i18next";

import PaymentInstructions from "../ui/PaymentInstructions";

interface ZahlungsInfoDialogProps {
  angebot: string;
  kampagne?: string;
  betrag: string;
  /** Nachweis (Rabatt) noch ausstehend → Betrag kann sich nach der Prüfung noch ändern. */
  nachweisOffen?: boolean;
  onClose: () => void;
}

export default function ZahlungsInfoDialog({
  angebot,
  kampagne,
  betrag,
  nachweisOffen = false,
  onClose,
}: ZahlungsInfoDialogProps) {
  const { t } = useTranslation("adhesions");
  const betragText = new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(Number(betrag));
  const zweck = kampagne ? `${angebot} – ${kampagne}` : angebot;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="zahlung-dialog-titel"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-cid-lg bg-bg-primary p-5 shadow-xl">
        <h2 id="zahlung-dialog-titel" className="text-base font-semibold text-text-primary">
          {t("zahlung.titel")}
        </h2>
        <p className="mt-1 text-sm text-text-secondary">{t("zahlung.hinweis")}</p>

        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-cid bg-bg-tertiary/40 p-3 text-sm">
          <dt className="text-text-tertiary">{t("zahlung.angebot")}</dt>
          <dd className="font-medium text-text-primary">{angebot}</dd>
          <dt className="text-text-tertiary">{t("zahlung.betrag")}</dt>
          <dd className="font-bold text-text-primary">{betragText}</dd>
          <dt className="text-text-tertiary">{t("zahlung.zweck")}</dt>
          <dd className="break-words text-text-primary">{zweck}</dd>
        </dl>

        {nachweisOffen && (
          <p className="mt-2 text-xs text-status-warningText">{t("zahlung.nachweis_hinweis")}</p>
        )}

        <div className="mt-3 flex flex-col gap-2">
          <PaymentInstructions mode="virement_sepa" />
          <PaymentInstructions mode="paypal" />
        </div>
        <p className="mt-3 text-xs text-text-tertiary">{t("zahlung.bestaetigung")}</p>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-cid bg-ca px-3 py-2 text-sm font-medium text-white hover:bg-cad"
        >
          {t("zahlung.schliessen")}
        </button>
      </div>
    </div>
  );
}
