/**
 * Page d'inscription (mockup #sc-register, FDD §3.1/F-002, AHM-47).
 *
 * Périmètre décidé avec l'utilisateur : formulaire minimal aligné sur
 * `RegisterSerializer` (email, mot de passe, langue préférée, consentement
 * RGPD) — pas les champs Membre (prénom, adresse, CIN…) du mockup complet.
 * Le compte créé est inactif ; c'est ensuite un rôle RH/Admin qui décide,
 * au cas par cas, si la personne devient réellement membre de l'association
 * (création de la fiche Membre) — voir AHM-48, pas ce ticket.
 */
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { z } from "zod";

import { register as registerCompte } from "../api/auth";
import { extractApiErrorMessage } from "../utils/apiError";

const registerSchema = z
  .object({
    email: z.string().min(1).email(),
    password: z.string().min(8),
    confirmPassword: z.string().min(1),
    langue_preferee: z.enum(["fr", "de", "ar"]),
    consentement_rgpd: z.literal(true),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "mismatch",
  });

type FormValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const { t } = useTranslation("auth");

  const [succes, setSucces] = useState(false);
  const [erreurServeur, setErreurServeur] = useState<string | null>(null);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      langue_preferee: "fr",
      // La case démarre décochée (false) ; le type littéral `true` du schéma
      // Zod ne l'autorise qu'après coche — cast nécessaire pour la valeur
      // par défaut réelle du champ non contrôlé.
      consentement_rgpd: false as unknown as true,
    },
  });

  async function onSubmit(values: FormValues) {
    setErreurServeur(null);
    setEnvoiEnCours(true);
    try {
      await registerCompte({
        email: values.email,
        password: values.password,
        langue_preferee: values.langue_preferee,
        consentement_rgpd: true,
      });
      setSucces(true);
    } catch (error) {
      setErreurServeur(extractApiErrorMessage(error, t("register.error_generique")));
    } finally {
      setEnvoiEnCours(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sb to-ca p-4">
      <div className="w-full max-w-[380px] rounded-cid-lg bg-white p-8 shadow-2xl">
        <div className="mb-6 flex flex-col items-center gap-2.5">
          <div className="flex h-[54px] w-[54px] items-center justify-center rounded-cid bg-ca shadow-lg shadow-ca/50">
            <span className="text-xl font-bold text-white">CID</span>
          </div>
          <h1 className="text-center text-lg font-bold text-text-primary">{t("register.title")}</h1>
          <p className="text-center text-xs text-text-tertiary">{t("register.subtitle")}</p>
        </div>

        {succes ? (
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-status-successBg text-xl text-status-successText">
              ✓
            </div>
            <p className="mb-1 text-sm font-semibold text-text-primary">
              {t("register.succes_titre")}
            </p>
            <p className="mb-5 text-sm text-text-secondary">{t("register.succes_message")}</p>
            <Link
              to="/login"
              className="inline-block rounded-cid bg-ca px-4 py-2 text-sm font-semibold text-white hover:bg-cad"
            >
              {t("register.succes_retour_connexion")}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
            <label className="text-sm font-medium text-text-secondary">
              {t("register.email")}
              <input
                type="email"
                {...register("email")}
                className="mt-1 w-full rounded-cid border border-black/10 px-3 py-2 text-sm outline-none focus:border-ca"
              />
              {errors.email && (
                <span className="mt-1 block text-xs text-status-dangerText">
                  {t("register.error_generique")}
                </span>
              )}
            </label>

            <label className="text-sm font-medium text-text-secondary">
              {t("register.password")}
              <input
                type="password"
                {...register("password")}
                className="mt-1 w-full rounded-cid border border-black/10 px-3 py-2 text-sm outline-none focus:border-ca"
              />
              {errors.password && (
                <span className="mt-1 block text-xs text-status-dangerText">
                  {t("register.error_password_min")}
                </span>
              )}
            </label>

            <label className="text-sm font-medium text-text-secondary">
              {t("register.confirm_password")}
              <input
                type="password"
                {...register("confirmPassword")}
                className="mt-1 w-full rounded-cid border border-black/10 px-3 py-2 text-sm outline-none focus:border-ca"
              />
              {errors.confirmPassword && (
                <span className="mt-1 block text-xs text-status-dangerText">
                  {t("register.error_password_mismatch")}
                </span>
              )}
            </label>

            <label className="text-sm font-medium text-text-secondary">
              {t("register.langue_preferee")}
              <select
                {...register("langue_preferee")}
                className="mt-1 w-full rounded-cid border border-black/10 px-3 py-2 text-sm outline-none focus:border-ca"
              >
                <option value="fr">Français</option>
                <option value="de">Deutsch</option>
                <option value="ar">العربية</option>
              </select>
            </label>

            <label className="mt-1 flex items-start gap-2 text-xs text-text-secondary">
              <input type="checkbox" className="mt-0.5 accent-ca" {...register("consentement_rgpd")} />
              {t("register.consentement_rgpd")}
            </label>
            {errors.consentement_rgpd && (
              <span className="-mt-2 block text-xs text-status-dangerText">
                {t("register.error_rgpd_requis")}
              </span>
            )}

            {erreurServeur && <p className="text-sm text-status-dangerText">{erreurServeur}</p>}

            <button
              type="submit"
              disabled={envoiEnCours}
              className="mt-2 rounded-cid bg-ca py-2.5 text-sm font-semibold text-white transition hover:bg-cad disabled:opacity-60"
            >
              {envoiEnCours ? t("register.loading") : t("register.submit")}
            </button>

            <p className="mt-1 text-center text-xs text-text-tertiary">
              {t("register.deja_membre")}{" "}
              <Link to="/login" className="font-medium text-ca hover:underline">
                {t("register.se_connecter")}
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
