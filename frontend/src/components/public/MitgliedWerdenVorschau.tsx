/**
 * Aperçu de la campagne d'adhésion en cours avant la page de connexion (demande utilisateur du
 * 2026-10-06, point 10 : "wenn man auf 'Mitglied werden' klickt soll man eine Vorschau über die
 * aktuelle Mitgliedschaftskampagne sehen, bevor man zur Login-Seite springt").
 */
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import MembershipOffersPublic from "./MembershipOffersPublic";
import { useCampagneActive } from "../../hooks/useAdhesions";

export default function MitgliedWerdenVorschau({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("public");
  const navigate = useNavigate();
  const campagne = useCampagneActive();

  function continuer() {
    navigate("/login", { state: { from: { pathname: "/mon-adhesion" } } });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("vorschau.titre")}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-cid-lg bg-bg-tertiary p-5 shadow-xl"
      >
        {campagne.isLoading && (
          <p className="text-sm text-text-tertiary">{t("vorschau.chargement")}</p>
        )}
        {campagne.isError && (
          <p className="text-sm text-text-secondary">{t("vorschau.aucune_campagne")}</p>
        )}
        {campagne.data && <MembershipOffersPublic campagne={campagne.data} />}
        <div className="mt-5 flex justify-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-cid px-4 py-2 text-sm text-text-secondary hover:bg-bg-secondary"
          >
            {t("vorschau.fermer")}
          </button>
          <button
            type="button"
            onClick={continuer}
            className="rounded-cid bg-ca px-5 py-2 text-sm font-semibold text-white hover:bg-cad"
          >
            {t("vorschau.continuer")}
          </button>
        </div>
      </div>
    </div>
  );
}
