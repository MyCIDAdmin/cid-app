/**
 * Datenschutzhinweis (mentions RGPD/DSGVO) affiché à l'inscription — ajouté le 2026-09-21,
 * demande utilisateur : "Anmeldung: Datenschutzhinweis hinzufügen. Benutzer soll den bei der
 * Registrierung annehmen". La case à cocher `consentement_rgpd` existait déjà (et reste le seul
 * mécanisme d'acceptation, obligatoire côté backend — RegisterSerializer.validate_
 * consentement_rgpd) mais ne renvoyait vers aucun texte réel : cette modale porte le contenu que
 * l'utilisateur accepte effectivement.
 *
 * Contenu à faire relire par un juriste/DPO de l'association avant mise en production (voir
 * message de livraison) — rédigé ici à partir des seules données réellement collectées par
 * RegisterPage/RegisterSerializer (FDD §3.1), pas une validation juridique.
 *
 * Même gabarit de modale que ConfirmDialog (components/ui/) — dialog + overlay + bouton fermer,
 * adapté pour un contenu long et défilant (max-h-[85vh] + overflow-y-auto).
 */
import { useTranslation } from "react-i18next";

interface DatenschutzhinweisModalProps {
  onClose: () => void;
}

const SECTIONS = [
  ["verantwortlicher_titre", "verantwortlicher_text"],
  ["daten_titre", "daten_text"],
  ["zweck_titre", "zweck_text"],
  ["speicherdauer_titre", "speicherdauer_text"],
  ["rechte_titre", "rechte_text"],
  ["kontakt_titre", "kontakt_text"],
] as const;

export default function DatenschutzhinweisModal({ onClose }: DatenschutzhinweisModalProps) {
  const { t } = useTranslation("auth");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="datenschutz-modal-titre"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-cid-lg bg-bg-primary shadow-xl">
        <div className="flex items-center justify-between border-b border-text-tertiary/10 px-5 py-3">
          <h2 id="datenschutz-modal-titre" className="text-base font-bold text-text-primary">
            {t("register.datenschutz.titre")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("register.datenschutz.fermer")}
            className="text-lg text-text-tertiary hover:text-text-primary"
          >
            ×
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm text-text-secondary">
          <p>{t("register.datenschutz.intro")}</p>
          {SECTIONS.map(([titreKey, texteKey]) => (
            <section key={titreKey}>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                {t(`register.datenschutz.${titreKey}`)}
              </h3>
              <p className="whitespace-pre-line">{t(`register.datenschutz.${texteKey}`)}</p>
            </section>
          ))}
        </div>

        <div className="border-t border-text-tertiary/10 px-5 py-3 text-right">
          <button
            type="button"
            onClick={onClose}
            className="rounded-cid bg-ca px-4 py-2 text-sm font-semibold text-white hover:bg-cad"
          >
            {t("register.datenschutz.fermer")}
          </button>
        </div>
      </div>
    </div>
  );
}
