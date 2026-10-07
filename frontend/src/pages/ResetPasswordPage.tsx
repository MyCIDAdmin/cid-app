/**
 * Confirmation de réinitialisation — page ouverte depuis le lien reçu par
 * email (FDD §3.1 : "lien valide 1h, usage unique"). Le jeton voyage dans
 * le paramètre `?token=` et n'est jamais affiché ni modifiable par
 * l'utilisateur, seulement transmis tel quel à l'API de confirmation.
 */
import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { z } from "zod";

import { confirmPasswordReset } from "../api/auth";
import BrandLogo from "../components/ui/BrandLogo";
import { extractApiErrorMessage } from "../utils/apiError";

const resetSchema = z
  .object({
    password: z.string().min(8),
    confirmPassword: z.string().min(1),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "mismatch",
  });

type FormValues = z.infer<typeof resetSchema>;

export default function ResetPasswordPage() {
  const { t } = useTranslation("auth");
  const [searchParams] = useSearchParams();
  // Token einmalig übernehmen und danach aus der Adresszeile entfernen (Browser-Verlauf,
  // Referrer, Screenshots) — er bleibt nur im Speicher dieser Seite.
  const [token] = useState(() => searchParams.get("token"));
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("token")) {
      window.history.replaceState(window.history.state, "", window.location.pathname);
    }
  }, []);

  const [succes, setSucces] = useState(false);
  const [erreurServeur, setErreurServeur] = useState<string | null>(null);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  async function onSubmit(values: FormValues) {
    if (!token) return;
    setErreurServeur(null);
    setEnvoiEnCours(true);
    try {
      await confirmPasswordReset(token, values.password);
      setSucces(true);
    } catch (error) {
      setErreurServeur(extractApiErrorMessage(error, t("reset_password.error_generique")));
    } finally {
      setEnvoiEnCours(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sb to-ca p-4">
      <div className="w-full max-w-[360px] rounded-cid-lg bg-bg-primary p-8 shadow-2xl">
        <div className="mb-6 flex flex-col items-center gap-2.5">
          <BrandLogo className="h-[54px] w-[54px] shadow-lg shadow-ca/50" />
          <h1 className="text-center text-lg font-bold text-text-primary">
            {t("reset_password.title")}
          </h1>
          <p className="text-center text-xs text-text-tertiary">{t("reset_password.subtitle")}</p>
        </div>

        {!token ? (
          <div className="text-center">
            <p className="mb-5 text-sm text-status-dangerText">
              {t("reset_password.lien_invalide")}
            </p>
            <Link
              to="/login"
              className="inline-block rounded-cid bg-ca px-4 py-2 text-sm font-semibold text-white hover:bg-cad"
            >
              {t("reset_password.se_connecter")}
            </Link>
          </div>
        ) : succes ? (
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-status-successBg text-xl text-status-successText">
              ✓
            </div>
            <p className="mb-1 text-sm font-semibold text-text-primary">
              {t("reset_password.succes_titre")}
            </p>
            <p className="mb-5 text-sm text-text-secondary">{t("reset_password.succes_message")}</p>
            <Link
              to="/login"
              className="inline-block rounded-cid bg-ca px-4 py-2 text-sm font-semibold text-white hover:bg-cad"
            >
              {t("reset_password.se_connecter")}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
            <label className="text-sm font-medium text-text-secondary">
              {t("reset_password.password")}
              <input
                type="password"
                {...register("password")}
                className="mt-1 w-full rounded-cid border border-text-tertiary/20 px-3 py-2 text-sm outline-none focus:border-ca"
              />
              {errors.password && (
                <span className="mt-1 block text-xs text-status-dangerText">
                  {t("reset_password.error_password_min")}
                </span>
              )}
            </label>

            <label className="text-sm font-medium text-text-secondary">
              {t("reset_password.confirm_password")}
              <input
                type="password"
                {...register("confirmPassword")}
                className="mt-1 w-full rounded-cid border border-text-tertiary/20 px-3 py-2 text-sm outline-none focus:border-ca"
              />
              {errors.confirmPassword && (
                <span className="mt-1 block text-xs text-status-dangerText">
                  {t("reset_password.error_password_mismatch")}
                </span>
              )}
            </label>

            {erreurServeur && <p className="text-sm text-status-dangerText">{erreurServeur}</p>}

            <button
              type="submit"
              disabled={envoiEnCours}
              className="mt-2 rounded-cid bg-ca py-2.5 text-sm font-semibold text-white transition hover:bg-cad disabled:opacity-60"
            >
              {envoiEnCours ? t("reset_password.loading") : t("reset_password.submit")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
