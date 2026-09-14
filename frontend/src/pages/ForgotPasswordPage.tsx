/**
 * Demande de réinitialisation de mot de passe (mockup #sc-login, lien
 * "Réinitialiser" ; FDD §3.1). Réponse volontairement générique, que
 * l'email corresponde à un compte ou non — anti-énumération (SCD), déjà
 * appliqué côté backend (PasswordResetRequestView), reproduit ici en
 * affichant toujours le même message de succès.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { requestPasswordReset } from "../api/auth";
import BrandLogo from "../components/ui/BrandLogo";
import { extractApiErrorMessage } from "../utils/apiError";

export default function ForgotPasswordPage() {
  const { t } = useTranslation("auth");

  const [email, setEmail] = useState("");
  const [succes, setSucces] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnvoiEnCours(true);
    try {
      await requestPasswordReset(email);
      setSucces(true);
    } catch (error) {
      setErreur(extractApiErrorMessage(error, t("forgot_password.error_generique")));
    } finally {
      setEnvoiEnCours(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sb to-ca p-4">
      <div className="w-full max-w-[360px] rounded-cid-lg bg-white p-8 shadow-2xl">
        <div className="mb-6 flex flex-col items-center gap-2.5">
          <BrandLogo className="h-[54px] w-[54px] shadow-lg shadow-ca/50" />
          <h1 className="text-center text-lg font-bold text-text-primary">
            {t("forgot_password.title")}
          </h1>
          <p className="text-center text-xs text-text-tertiary">{t("forgot_password.subtitle")}</p>
        </div>

        {succes ? (
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-status-successBg text-xl text-status-successText">
              ✓
            </div>
            <p className="mb-1 text-sm font-semibold text-text-primary">
              {t("forgot_password.succes_titre")}
            </p>
            <p className="mb-5 text-sm text-text-secondary">
              {t("forgot_password.succes_message")}
            </p>
            <Link
              to="/login"
              className="inline-block rounded-cid bg-ca px-4 py-2 text-sm font-semibold text-white hover:bg-cad"
            >
              {t("forgot_password.retour_connexion")}
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <label className="text-sm font-medium text-text-secondary">
              {t("forgot_password.email")}
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-cid border border-black/10 px-3 py-2 text-sm outline-none focus:border-ca"
              />
            </label>

            {erreur && <p className="text-sm text-status-dangerText">{erreur}</p>}

            <button
              type="submit"
              disabled={envoiEnCours}
              className="mt-2 rounded-cid bg-ca py-2.5 text-sm font-semibold text-white transition hover:bg-cad disabled:opacity-60"
            >
              {envoiEnCours ? t("forgot_password.loading") : t("forgot_password.submit")}
            </button>

            <p className="mt-1 text-center text-xs text-text-tertiary">
              <Link to="/login" className="font-medium text-ca hover:underline">
                {t("forgot_password.retour_connexion")}
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
