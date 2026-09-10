import { useTranslation } from "react-i18next";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Modale de confirmation générique (actions irréversibles — suppression,
 * etc.), réutilisable par les prochains modules (cotisations, adhesions...).
 * Voir mockup : confirmAction(titre, message, callback, danger).
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation("common");

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-sm rounded-cid-lg bg-bg-primary p-5 shadow-xl">
        <h2 id="confirm-dialog-title" className="text-base font-semibold text-text-primary">
          {title}
        </h2>
        <p className="mt-2 text-sm text-text-secondary">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary"
          >
            {t("action.annuler")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-cid px-3 py-1.5 text-sm font-medium text-white ${
              danger ? "bg-status-dangerText hover:opacity-90" : "bg-ca hover:bg-cad"
            }`}
          >
            {confirmLabel ?? t("action.confirmer")}
          </button>
        </div>
      </div>
    </div>
  );
}
