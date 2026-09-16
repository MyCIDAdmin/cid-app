import { useTranslation } from "react-i18next";

import { CHAMPS_EXPORT } from "../../types/membre";
import type { ChampExport } from "../../types/membre";

interface ExportChampsDialogProps {
  open: boolean;
  selection: ChampExport[];
  onToggle: (champ: ChampExport) => void;
  onToutSelectionner: () => void;
  onToutDeselectionner: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Sélection des colonnes à inclure dans l'export Excel des membres (demande
 * utilisateur du 2026-09-16, 2e) — précède l'appel à exporterMembres()
 * (voir MembresListPage), qui transmet la sélection via le paramètre
 * `champs` de GET /membres/export/ (apps.membres.exports.CHAMPS_EXPORT).
 */
export default function ExportChampsDialog({
  open,
  selection,
  onToggle,
  onToutSelectionner,
  onToutDeselectionner,
  onConfirm,
  onCancel,
}: ExportChampsDialogProps) {
  const { t } = useTranslation("membres");

  if (!open) return null;

  const aucuneSelection = selection.length === 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-champs-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-md rounded-cid-lg bg-bg-primary p-5 shadow-xl">
        <h2 id="export-champs-dialog-title" className="text-base font-semibold text-text-primary">
          {t("liste.export_champs_titre")}
        </h2>
        <p className="mt-1 text-sm text-text-secondary">{t("liste.export_champs_description")}</p>

        <div className="mt-3 flex gap-3 text-xs">
          <button type="button" onClick={onToutSelectionner} className="text-ca hover:underline">
            {t("liste.export_champs_tout_selectionner")}
          </button>
          <button type="button" onClick={onToutDeselectionner} className="text-ca hover:underline">
            {t("liste.export_champs_tout_deselectionner")}
          </button>
        </div>

        <div className="mt-3 grid max-h-72 grid-cols-2 gap-x-4 gap-y-2 overflow-y-auto">
          {CHAMPS_EXPORT.map((champ) => (
            <label
              key={champ.value}
              className="flex items-center gap-2 text-sm text-text-primary"
            >
              <input
                type="checkbox"
                checked={selection.includes(champ.value)}
                onChange={() => onToggle(champ.value)}
                className="rounded border-text-tertiary/30"
              />
              {t(champ.labelKey)}
            </label>
          ))}
        </div>

        {aucuneSelection && (
          <p className="mt-3 text-sm text-status-dangerText">
            {t("liste.export_champs_aucune_selection")}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary"
          >
            {t("formulaire.annuler")}
          </button>
          <button
            type="button"
            disabled={aucuneSelection}
            onClick={onConfirm}
            className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-40"
          >
            {t("liste.export_champs_confirmer")}
          </button>
        </div>
      </div>
    </div>
  );
}
