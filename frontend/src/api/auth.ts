import { apiClient } from "./client";
import type { CidUser } from "../store/authStore";
import { getDeviceId } from "../utils/deviceId";

export interface LoginResponse {
  requires_2fa?: boolean;
  login_ticket?: string;
  totp_available?: boolean;
  access?: string;
  refresh?: string;
  user?: CidUser;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  // task #218 (2026-09-24) : `device_id` permet au backend de terminer toute session encore
  // active sur ce même appareil — voir utils/deviceId.ts.
  const { data } = await apiClient.post<LoginResponse>("/auth/login/", {
    email,
    password,
    device_id: getDeviceId(),
  });
  return data;
}

export async function sendOtp(loginTicket: string): Promise<void> {
  await apiClient.post("/auth/2fa/send-otp/", { login_ticket: loginTicket });
}

export async function verify2FA(
  loginTicket: string,
  method: "totp" | "email_otp",
  code: string,
): Promise<LoginResponse> {
  const { data } = await apiClient.post<LoginResponse>("/auth/2fa/verify/", {
    login_ticket: loginTicket,
    method,
    code,
  });
  return data;
}

export async function fetchMe(): Promise<CidUser> {
  const { data } = await apiClient.get<CidUser>("/auth/me/");
  return data;
}

/**
 * Payload complet AHM-50 (mockup #sc-register) — au-delà du compte de
 * connexion, la fiche Membre (identité, CIN, contact, adresse en
 * Allemagne) est saisie dès l'inscription ; voir RegisterSerializer.
 */
export interface RegisterPayload {
  email: string;
  password: string;
  langue_preferee: "fr" | "de" | "ar";
  consentement_rgpd: true;
  prenom: string;
  nom: string;
  date_naissance: string;
  sexe?: "homme" | "femme" | "non_renseigne";
  // CIN redevenu optionnel côté frontend le 2026-09-28 (retour utilisateur, point 5) : ni CIN ni
  // passeport n'est requis isolément, mais le backend (RegisterSerializer.validate) exige qu'au
  // moins l'un des deux soit renseigné — voir le .refine() correspondant dans RegisterPage.tsx.
  cin?: string;
  passeport?: string;
  telephone: string;
  adresse_de: string;
  code_postal_de?: string;
  ville_de: string;
  land_de?: string;
  ville_origine_tn?: string;
  gouvernorat_tn?: string;
}

/**
 * POST /auth/register/ (FDD §3.1, F-002, AHM-50). Crée le compte ET la
 * fiche Membre (statut en_attente), tous deux inactifs. L'étape suivante
 * est la confirmation du code reçu par email (confirmRegistration) — RH ne
 * voit la demande qu'ensuite (AHM-48).
 */
export async function register(payload: RegisterPayload): Promise<void> {
  await apiClient.post("/auth/register/", payload);
}

/** POST /auth/register/confirm/ — code à 6 chiffres reçu par email. */
export async function confirmRegistration(email: string, code: string): Promise<{ message: string }> {
  const { data } = await apiClient.post<{ message: string }>("/auth/register/confirm/", {
    email,
    code,
  });
  return data;
}

/** POST /auth/register/resend-code/ — réponse toujours générique (anti-énumération). */
export async function resendRegistrationCode(email: string): Promise<{ message: string }> {
  const { data } = await apiClient.post<{ message: string }>("/auth/register/resend-code/", {
    email,
  });
  return data;
}

/**
 * POST /auth/password-reset/ (FDD §3.1). Répond 200 avec un message
 * générique que l'email corresponde à un compte ou non (anti-énumération
 * côté backend) — rien à distinguer ici non plus.
 */
export async function requestPasswordReset(email: string): Promise<{ message: string }> {
  const { data } = await apiClient.post<{ message: string }>("/auth/password-reset/", { email });
  return data;
}

/** POST /auth/password-reset/confirm/ — jeton reçu par email, valide 1h, usage unique. */
export async function confirmPasswordReset(
  token: string,
  newPassword: string,
): Promise<{ message: string }> {
  const { data } = await apiClient.post<{ message: string }>("/auth/password-reset/confirm/", {
    token,
    new_password: newPassword,
  });
  return data;
}
