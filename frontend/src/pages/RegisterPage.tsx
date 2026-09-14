/**
 * Page d'inscription (mockup #sc-register, FDD §3.1/F-002, AHM-47/AHM-50).
 *
 * Reprend désormais le formulaire complet du mockup : au-delà du compte de
 * connexion, la fiche Membre (identité, CIN, contact, adresse en Allemagne)
 * est saisie dès l'inscription — elle est créée côté backend en même temps
 * que le compte, statut `en_attente` (RegisterSerializer). Trois étapes :
 * formulaire -> confirmation du code reçu par email -> succès. Le compte
 * reste inactif jusqu'à la validation d'un rôle RH/Admin (AHM-48), qui ne
 * voit la demande qu'une fois l'email confirmé.
 */
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { z } from "zod";

import {
  confirmRegistration,
  register as registerCompte,
  resendRegistrationCode,
} from "../api/auth";
import BrandLogo from "../components/ui/BrandLogo";
import { BUNDESLANDER } from "../types/membre";
import { extractApiErrorMessage } from "../utils/apiError";

const registerSchema = z
  .object({
    prenom: z.string().min(1),
    nom: z.string().min(1),
    date_naissance: z.string().min(1),
    sexe: z.enum(["homme", "femme", "non_renseigne"]),
    cin: z.string().min(1),
    passeport: z.string().optional(),
    email: z.string().min(1).email(),
    telephone: z.string().min(1),
    adresse_de: z.string().min(1),
    code_postal_de: z.string().optional(),
    ville_de: z.string().min(1),
    land_de: z.string().optional(),
    ville_origine_tn: z.string().optional(),
    gouvernorat_tn: z.string().optional(),
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

const codeSchema = z.object({ code: z.string().length(6) });
type CodeValues = z.infer<typeof codeSchema>;

function Champ({
  label,
  htmlFor,
  requis,
  erreur,
  children,
}: {
  label: string;
  htmlFor: string;
  requis?: boolean;
  erreur?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-text-secondary">
        {label}
        {requis && <span className="text-status-dangerText"> *</span>}
      </label>
      {children}
      {erreur && <p className="mt-1 text-xs text-status-dangerText">{erreur}</p>}
    </div>
  );
}

const champClasses =
  "w-full rounded-cid border border-black/10 px-3 py-2 text-sm outline-none focus:border-ca";

type Step = "form" | "confirm" | "success";

export default function RegisterPage() {
  const { t } = useTranslation("auth");

  const [step, setStep] = useState<Step>("form");
  const [emailInscrit, setEmailInscrit] = useState("");
  const [erreurServeur, setErreurServeur] = useState<string | null>(null);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [messageRenvoi, setMessageRenvoi] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      prenom: "",
      nom: "",
      date_naissance: "",
      sexe: "non_renseigne",
      cin: "",
      passeport: "",
      email: "",
      telephone: "",
      adresse_de: "",
      code_postal_de: "",
      ville_de: "",
      land_de: "",
      ville_origine_tn: "",
      gouvernorat_tn: "",
      password: "",
      confirmPassword: "",
      langue_preferee: "fr",
      // La case démarre décochée (false) ; le type littéral `true` du schéma
      // Zod ne l'autorise qu'après coche — cast nécessaire pour la valeur
      // par défaut réelle du champ non contrôlé.
      consentement_rgpd: false as unknown as true,
    },
  });

  const {
    register: registerCode,
    handleSubmit: handleSubmitCode,
    formState: { errors: erreursCode },
  } = useForm<CodeValues>({ resolver: zodResolver(codeSchema), defaultValues: { code: "" } });

  async function onSubmit(values: FormValues) {
    setErreurServeur(null);
    setEnvoiEnCours(true);
    try {
      await registerCompte({
        email: values.email,
        password: values.password,
        langue_preferee: values.langue_preferee,
        consentement_rgpd: true,
        prenom: values.prenom,
        nom: values.nom,
        date_naissance: values.date_naissance,
        sexe: values.sexe,
        cin: values.cin,
        passeport: values.passeport || undefined,
        telephone: values.telephone,
        adresse_de: values.adresse_de,
        code_postal_de: values.code_postal_de || undefined,
        ville_de: values.ville_de,
        land_de: values.land_de || undefined,
        ville_origine_tn: values.ville_origine_tn || undefined,
        gouvernorat_tn: values.gouvernorat_tn || undefined,
      });
      setEmailInscrit(values.email);
      setStep("confirm");
    } catch (error) {
      setErreurServeur(extractApiErrorMessage(error, t("register.error_generique")));
    } finally {
      setEnvoiEnCours(false);
    }
  }

  async function onSubmitCode(values: CodeValues) {
    setErreurServeur(null);
    setEnvoiEnCours(true);
    try {
      await confirmRegistration(emailInscrit, values.code);
      setStep("success");
    } catch (error) {
      setErreurServeur(extractApiErrorMessage(error, t("register.confirm_error_code_invalide")));
    } finally {
      setEnvoiEnCours(false);
    }
  }

  async function renvoyerCode() {
    setMessageRenvoi(null);
    try {
      const { message } = await resendRegistrationCode(emailInscrit);
      setMessageRenvoi(message);
    } catch {
      setMessageRenvoi(t("register.confirm_renvoi_erreur"));
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sb to-ca p-4">
      <div className="w-full max-w-[560px] rounded-cid-lg bg-white p-8 shadow-2xl">
        <div className="mb-6 flex flex-col items-center gap-2.5">
          <BrandLogo className="h-[54px] w-[54px] shadow-lg shadow-ca/50" />
          <h1 className="text-center text-lg font-bold text-text-primary">{t("register.title")}</h1>
          <p className="text-center text-xs text-text-tertiary">{t("register.subtitle")}</p>
        </div>

        {step === "success" && (
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
        )}

        {step === "confirm" && (
          <form
            onSubmit={handleSubmitCode(onSubmitCode)}
            className="flex flex-col gap-3 text-center"
          >
            <p className="text-sm text-text-secondary">
              {t("register.confirm_message", { email: emailInscrit })}
            </p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              aria-label={t("register.confirm_code")}
              {...registerCode("code")}
              className="mx-auto w-full max-w-[200px] rounded-cid border border-black/10 px-3 py-2 text-center text-lg tracking-[0.4em] outline-none focus:border-ca"
              placeholder="000000"
            />
            {erreursCode.code && (
              <span className="text-xs text-status-dangerText">
                {t("register.confirm_error_format")}
              </span>
            )}
            {erreurServeur && <p className="text-sm text-status-dangerText">{erreurServeur}</p>}
            <button
              type="submit"
              disabled={envoiEnCours}
              className="mt-1 rounded-cid bg-ca py-2.5 text-sm font-semibold text-white transition hover:bg-cad disabled:opacity-60"
            >
              {envoiEnCours ? t("register.loading") : t("register.confirm_submit")}
            </button>
            <button type="button" onClick={renvoyerCode} className="text-xs text-ca underline">
              {t("register.confirm_renvoyer")}
            </button>
            {messageRenvoi && <p className="text-xs text-text-tertiary">{messageRenvoi}</p>}
          </form>
        )}

        {step === "form" && (
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase text-text-tertiary">
                {t("register.section_personnelles")}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Champ
                  label={t("register.prenom")}
                  htmlFor="prenom"
                  requis
                  erreur={errors.prenom && t("register.error_champ_requis")}
                >
                  <input id="prenom" {...register("prenom")} className={champClasses} />
                </Champ>
                <Champ
                  label={t("register.nom")}
                  htmlFor="nom"
                  requis
                  erreur={errors.nom && t("register.error_champ_requis")}
                >
                  <input id="nom" {...register("nom")} className={champClasses} />
                </Champ>
                <Champ
                  label={t("register.date_naissance")}
                  htmlFor="date_naissance"
                  requis
                  erreur={errors.date_naissance && t("register.error_champ_requis")}
                >
                  <input
                    id="date_naissance"
                    type="date"
                    {...register("date_naissance")}
                    className={champClasses}
                  />
                </Champ>
                <Champ label={t("register.sexe")} htmlFor="sexe">
                  <select id="sexe" {...register("sexe")} className={champClasses}>
                    <option value="non_renseigne">{t("register.sexe_non_renseigne")}</option>
                    <option value="homme">{t("register.sexe_homme")}</option>
                    <option value="femme">{t("register.sexe_femme")}</option>
                  </select>
                </Champ>
                <Champ
                  label={t("register.cin")}
                  htmlFor="cin"
                  requis
                  erreur={errors.cin && t("register.error_champ_requis")}
                >
                  <input id="cin" {...register("cin")} className={champClasses} />
                </Champ>
                <Champ label={t("register.passeport")} htmlFor="passeport">
                  <input id="passeport" {...register("passeport")} className={champClasses} />
                </Champ>
              </div>
            </section>

            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase text-text-tertiary">
                {t("register.section_contact")}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Champ
                  label={t("register.email")}
                  htmlFor="email"
                  requis
                  erreur={errors.email && t("register.error_generique")}
                >
                  <input id="email" type="email" {...register("email")} className={champClasses} />
                </Champ>
                <Champ
                  label={t("register.telephone")}
                  htmlFor="telephone"
                  requis
                  erreur={errors.telephone && t("register.error_champ_requis")}
                >
                  <input id="telephone" {...register("telephone")} className={champClasses} />
                </Champ>
              </div>
            </section>

            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase text-text-tertiary">
                {t("register.section_adresse")}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Champ
                  label={t("register.adresse_de")}
                  htmlFor="adresse_de"
                  requis
                  erreur={errors.adresse_de && t("register.error_champ_requis")}
                >
                  <input id="adresse_de" {...register("adresse_de")} className={champClasses} />
                </Champ>
                <Champ label={t("register.code_postal_de")} htmlFor="code_postal_de">
                  <input
                    id="code_postal_de"
                    {...register("code_postal_de")}
                    className={champClasses}
                  />
                </Champ>
                <Champ
                  label={t("register.ville_de")}
                  htmlFor="ville_de"
                  requis
                  erreur={errors.ville_de && t("register.error_champ_requis")}
                >
                  <input id="ville_de" {...register("ville_de")} className={champClasses} />
                </Champ>
                <Champ label={t("register.land_de")} htmlFor="land_de">
                  <select id="land_de" {...register("land_de")} className={champClasses}>
                    <option value="">—</option>
                    {BUNDESLANDER.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </Champ>
                <Champ label={t("register.ville_origine_tn")} htmlFor="ville_origine_tn">
                  <input
                    id="ville_origine_tn"
                    {...register("ville_origine_tn")}
                    className={champClasses}
                  />
                </Champ>
                <Champ label={t("register.gouvernorat_tn")} htmlFor="gouvernorat_tn">
                  <input
                    id="gouvernorat_tn"
                    {...register("gouvernorat_tn")}
                    className={champClasses}
                  />
                </Champ>
              </div>
            </section>

            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase text-text-tertiary">
                {t("register.section_securite")}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Champ
                  label={t("register.password")}
                  htmlFor="password"
                  requis
                  erreur={errors.password && t("register.error_password_min")}
                >
                  <input
                    id="password"
                    type="password"
                    {...register("password")}
                    className={champClasses}
                  />
                </Champ>
                <Champ
                  label={t("register.confirm_password")}
                  htmlFor="confirmPassword"
                  requis
                  erreur={errors.confirmPassword && t("register.error_password_mismatch")}
                >
                  <input
                    id="confirmPassword"
                    type="password"
                    {...register("confirmPassword")}
                    className={champClasses}
                  />
                </Champ>
                <Champ label={t("register.langue_preferee")} htmlFor="langue_preferee">
                  <select
                    id="langue_preferee"
                    {...register("langue_preferee")}
                    className={champClasses}
                  >
                    <option value="fr">Français</option>
                    <option value="de">Deutsch</option>
                    <option value="ar">العربية</option>
                  </select>
                </Champ>
              </div>

              <label className="mt-3 flex items-start gap-2 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-ca"
                  {...register("consentement_rgpd")}
                />
                {t("register.consentement_rgpd")}
              </label>
              {errors.consentement_rgpd && (
                <span className="mt-1 block text-xs text-status-dangerText">
                  {t("register.error_rgpd_requis")}
                </span>
              )}
            </section>

            {erreurServeur && <p className="text-sm text-status-dangerText">{erreurServeur}</p>}

            <button
              type="submit"
              disabled={envoiEnCours}
              className="rounded-cid bg-ca py-2.5 text-sm font-semibold text-white transition hover:bg-cad disabled:opacity-60"
            >
              {envoiEnCours ? t("register.loading") : t("register.submit")}
            </button>

            <p className="text-center text-xs text-text-tertiary">
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
