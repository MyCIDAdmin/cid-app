/**
 * Fan-Konto (Release 29) : schlanke Anmeldung ohne Mitgliedschaft — Name, E-Mail, Passwort,
 * Bundesland/Standort und Einwilligung. Drei Schritte wie bei der Mitgliedsanmeldung :
 * Formular → Code aus der E-Mail → fertig. Die Bestätigung nutzt dieselben Endpunkte
 * (`/auth/register/confirm/`).
 */
import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { z } from "zod";

import { confirmRegistration, resendRegistrationCode } from "../api/auth";
import { registriereFan } from "../api/regionen";
import DatenschutzhinweisModal from "../components/auth/DatenschutzhinweisModal";
import BrandLogo from "../components/ui/BrandLogo";
import { useFanOptionen } from "../hooks/useRegionen";
import { extractApiErrorMessage } from "../utils/apiError";
import { laenderName } from "../utils/laendernamen";

const schema = z
  .object({
    prenom: z.string().min(1),
    nom: z.string().min(1),
    email: z.string().min(1).email(),
    password: z.string().min(8),
    confirmPassword: z.string().min(1),
    langue_preferee: z.enum(["fr", "de", "ar"]),
    pays: z.string().min(2),
    land_de: z.string().optional(),
    standort: z.string().optional(),
    consentement_rgpd: z.literal(true),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "mismatch",
  });
type FormValues = z.infer<typeof schema>;

const codeSchema = z.object({ code: z.string().length(6) });
type CodeValues = z.infer<typeof codeSchema>;

const feld =
  "w-full rounded-cid border border-text-tertiary/20 px-3 py-2 text-sm outline-none focus:border-ca";

function Champ({
  label,
  id,
  fehler,
  children,
}: {
  label: string;
  id: string;
  fehler?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-text-secondary">
        {label}
      </label>
      {children}
      {fehler && <span className="mt-1 block text-xs text-status-dangerText">{fehler}</span>}
    </div>
  );
}

type Schritt = "form" | "confirm" | "success";

export default function FanRegisterPage() {
  const { t, i18n } = useTranslation("auth");
  const { data: optionen } = useFanOptionen();
  const [schritt, setSchritt] = useState<Schritt>("form");
  const [emailInscrit, setEmailInscrit] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [renvoi, setRenvoi] = useState<string | null>(null);
  const [datenschutz, setDatenschutz] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      prenom: "",
      nom: "",
      email: "",
      password: "",
      confirmPassword: "",
      langue_preferee: "de",
      pays: "DE",
      land_de: "",
      standort: "",
      consentement_rgpd: false as unknown as true,
    },
  });
  const {
    register: registerCode,
    handleSubmit: handleSubmitCode,
    formState: { errors: codeFehler },
  } = useForm<CodeValues>({ resolver: zodResolver(codeSchema), defaultValues: { code: "" } });

  const pays = watch("pays");
  const imInland = pays === "DE";
  const land = imInland ? watch("land_de") : "";
  const regionName = imInland
    ? (optionen?.laender.find((l) => l.code === land)?.region?.name ?? null)
    : (optionen?.staaten.find((s) => s.code === pays)?.region?.name ?? null);
  const standorte = useMemo(
    () => (optionen?.standorte ?? []).filter((s) => !land || !s.land || s.land === land),
    [optionen, land],
  );

  async function onSubmit(v: FormValues) {
    setFehler(null);
    setLaeuft(true);
    try {
      await registriereFan({
        email: v.email,
        password: v.password,
        prenom: v.prenom,
        nom: v.nom,
        langue_preferee: v.langue_preferee,
        pays: v.pays,
        land_de: imInland ? v.land_de || undefined : undefined,
        standort: v.standort || null,
        consentement_rgpd: true,
      });
      setEmailInscrit(v.email);
      setSchritt("confirm");
    } catch (error) {
      setFehler(extractApiErrorMessage(error, t("register.error_generique")));
    } finally {
      setLaeuft(false);
    }
  }

  async function onCode(v: CodeValues) {
    setFehler(null);
    setLaeuft(true);
    try {
      await confirmRegistration(emailInscrit, v.code);
      setSchritt("success");
    } catch (error) {
      setFehler(extractApiErrorMessage(error, t("register.confirm_error_code_invalide")));
    } finally {
      setLaeuft(false);
    }
  }

  async function codeNeu() {
    setRenvoi(null);
    try {
      setRenvoi((await resendRegistrationCode(emailInscrit)).message);
    } catch {
      setRenvoi(t("register.confirm_renvoi_erreur"));
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sb to-ca p-4">
      <div className="w-full max-w-[520px] rounded-cid-lg bg-bg-primary p-8 shadow-2xl">
        <div className="mb-6 flex flex-col items-center gap-2.5">
          <BrandLogo className="h-[54px] w-[54px] shadow-lg shadow-ca/50" />
          <h1 className="text-center text-lg font-bold text-text-primary">{t("fan.title")}</h1>
          <p className="text-center text-xs text-text-tertiary">{t("fan.subtitle")}</p>
        </div>

        {schritt === "success" && (
          <div className="text-center">
            <p className="mb-1 text-sm font-semibold text-text-primary">{t("fan.succes_titre")}</p>
            <p className="mb-5 text-sm text-text-secondary">{t("fan.succes_message")}</p>
            <Link
              to="/login"
              className="inline-block rounded-cid bg-ca px-4 py-2 text-sm font-semibold text-white hover:bg-cad"
            >
              {t("register.succes_retour_connexion")}
            </Link>
          </div>
        )}

        {schritt === "confirm" && (
          <form onSubmit={handleSubmitCode(onCode)} className="flex flex-col gap-3 text-center">
            <p className="text-sm text-text-secondary">
              {t("register.confirm_message", { email: emailInscrit })}
            </p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              aria-label={t("register.confirm_code")}
              {...registerCode("code")}
              className="mx-auto w-full max-w-[200px] rounded-cid border border-text-tertiary/20 px-3 py-2 text-center text-lg tracking-[0.4em] outline-none focus:border-ca"
              placeholder="000000"
            />
            {codeFehler.code && (
              <span className="text-xs text-status-dangerText">
                {t("register.confirm_error_format")}
              </span>
            )}
            {fehler && <p className="text-sm text-status-dangerText">{fehler}</p>}
            <button
              type="submit"
              disabled={laeuft}
              className="mt-1 rounded-cid bg-ca py-2.5 text-sm font-semibold text-white transition hover:bg-cad disabled:opacity-60"
            >
              {laeuft ? t("register.loading") : t("register.confirm_submit")}
            </button>
            <button type="button" onClick={codeNeu} className="text-xs text-ca underline">
              {t("register.confirm_renvoyer")}
            </button>
            {renvoi && <p className="text-xs text-text-tertiary">{renvoi}</p>}
          </form>
        )}

        {schritt === "form" && (
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Champ
                label={t("register.prenom")}
                id="prenom"
                fehler={errors.prenom && t("register.error_champ_requis")}
              >
                <input id="prenom" {...register("prenom")} className={feld} />
              </Champ>
              <Champ
                label={t("register.nom")}
                id="nom"
                fehler={errors.nom && t("register.error_champ_requis")}
              >
                <input id="nom" {...register("nom")} className={feld} />
              </Champ>
            </div>
            <Champ
              label={t("register.email")}
              id="email"
              fehler={errors.email && t("register.error_champ_requis")}
            >
              <input id="email" type="email" {...register("email")} className={feld} />
            </Champ>
            <div className="grid gap-3 sm:grid-cols-2">
              <Champ
                label={t("register.password")}
                id="password"
                fehler={errors.password && t("register.error_password_min")}
              >
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  {...register("password")}
                  className={feld}
                />
              </Champ>
              <Champ
                label={t("register.confirm_password")}
                id="confirmPassword"
                fehler={errors.confirmPassword && t("register.error_password_mismatch")}
              >
                <input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  {...register("confirmPassword")}
                  className={feld}
                />
              </Champ>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Champ label={t("fan.pays")} id="pays">
                <select id="pays" {...register("pays")} className={feld}>
                  <option value="DE">{laenderName("DE", i18n.language, "Deutschland")}</option>
                  {optionen?.staaten.map((s) => (
                    <option key={s.code} value={s.code}>
                      {laenderName(s.code, i18n.language, s.name)}
                    </option>
                  ))}
                </select>
              </Champ>
              {imInland && (
                <Champ label={t("register.land_de")} id="land_de">
                  <select id="land_de" {...register("land_de")} className={feld}>
                    <option value="">{t("fan.land_keine")}</option>
                    {optionen?.laender.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </Champ>
              )}
              <Champ label={t("fan.standort")} id="standort">
                <select id="standort" {...register("standort")} className={feld}>
                  <option value="">{t("fan.standort_keiner")}</option>
                  {standorte.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Champ>
            </div>
            {(land || !imInland) && (
              <p className="text-xs text-text-tertiary">
                {regionName
                  ? t("fan.region_hinweis", { region: regionName })
                  : t(imInland ? "fan.ohne_region" : "fan.ohne_region_land")}
              </p>
            )}
            <Champ label={t("register.langue_preferee")} id="langue_preferee">
              <select id="langue_preferee" {...register("langue_preferee")} className={feld}>
                <option value="de">Deutsch</option>
                <option value="fr">Français</option>
                <option value="ar">العربية</option>
              </select>
            </Champ>

            <button
              type="button"
              onClick={() => setDatenschutz(true)}
              className="text-left text-xs font-medium text-ca underline underline-offset-2"
            >
              {t("register.lire_datenschutzhinweis")}
            </button>
            <label className="flex items-start gap-2 text-xs text-text-secondary">
              <input
                type="checkbox"
                className="mt-0.5 accent-ca"
                {...register("consentement_rgpd")}
              />
              {t("fan.consentement")}
            </label>
            {errors.consentement_rgpd && (
              <span className="block text-xs text-status-dangerText">
                {t("register.error_rgpd_requis")}
              </span>
            )}

            {fehler && <p className="text-sm text-status-dangerText">{fehler}</p>}
            <button
              type="submit"
              disabled={laeuft}
              className="rounded-cid bg-ca py-2.5 text-sm font-semibold text-white transition hover:bg-cad disabled:opacity-60"
            >
              {laeuft ? t("register.loading") : t("fan.submit")}
            </button>
            <p className="text-center text-xs text-text-tertiary">
              {t("fan.schon_konto")}{" "}
              <Link to="/login" className="font-medium text-ca hover:underline">
                {t("register.se_connecter")}
              </Link>
              {" · "}
              <Link to="/register" className="font-medium text-ca hover:underline">
                {t("fan.lieber_mitglied")}
              </Link>
            </p>
          </form>
        )}
      </div>
      {datenschutz && <DatenschutzhinweisModal fan onClose={() => setDatenschutz(false)} />}
    </div>
  );
}
