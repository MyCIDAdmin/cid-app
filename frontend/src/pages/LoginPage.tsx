/**
 * Page de connexion — étape 1 (email/mdp) + étape 2 conditionnelle (2FA),
 * cf mockup #sc-login et FDD §3.1 / §5.1. Design : dégradé sb -> ca.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

import { login, verify2FA, sendOtp } from "../api/auth";
import { useAuthStore } from "../store/authStore";
import { extractApiErrorMessage } from "../utils/apiError";

type Step = "credentials" | "twofa";

export default function LoginPage() {
  const { t } = useTranslation("auth");
  const navigate = useNavigate();
  const loginSuccess = useAuthStore((s) => s.loginSuccess);

  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [loginTicket, setLoginTicket] = useState<string | null>(null);
  const [totpAvailable, setTotpAvailable] = useState(false);
  const [method, setMethod] = useState<"totp" | "email_otp">("email_otp");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await login(email, password);
      if (res.requires_2fa && res.login_ticket) {
        setLoginTicket(res.login_ticket);
        setTotpAvailable(Boolean(res.totp_available));
        setMethod(res.totp_available ? "totp" : "email_otp");
        if (!res.totp_available) {
          await sendOtp(res.login_ticket);
        }
        setStep("twofa");
      } else if (res.access && res.refresh && res.user) {
        loginSuccess(res.access, res.refresh, res.user);
        navigate("/dashboard");
      }
    } catch (err) {
      // Le backend distingue "identifiants invalides" (401) de "compte pas
      // encore activé par RH/Admin" (403 account_inactive) avec un message
      // clair pour chaque cas (LoginView) — on l'affiche tel quel plutôt que
      // de toujours renvoyer le message générique, qui masquait la vraie
      // raison et laissait croire à un mot de passe incorrect.
      setError(extractApiErrorMessage(err, t("login.error_invalid")));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!loginTicket) return;
    setError(null);
    setLoading(true);
    try {
      const res = await verify2FA(loginTicket, method, code);
      if (res.access && res.refresh && res.user) {
        loginSuccess(res.access, res.refresh, res.user);
        navigate("/dashboard");
      }
    } catch {
      setError(t("twofa.error_invalid"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sb to-ca p-4">
      <div className="w-full max-w-[360px] rounded-cid-lg bg-white p-8 shadow-2xl">
        <div className="mb-6 flex flex-col items-center gap-2.5">
          <div className="flex h-[54px] w-[54px] items-center justify-center rounded-cid bg-ca shadow-lg shadow-ca/50">
            <span className="text-xl font-bold text-white">CID</span>
          </div>
          <h1 className="text-center text-lg font-bold text-text-primary">
            Clubistes in Deutschland
          </h1>
        </div>

        <p className="mb-4 rounded-cid border border-amber-300 bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-800">
          {t("notice.under_construction")}
        </p>

        {step === "credentials" ? (
          <form onSubmit={handleCredentialsSubmit} className="flex flex-col gap-3">
            <label className="text-sm font-medium text-text-secondary">
              {t("login.email")}
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-cid border border-black/10 px-3 py-2 text-sm outline-none focus:border-ca"
              />
            </label>
            <label className="text-sm font-medium text-text-secondary">
              {t("login.password")}
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-cid border border-black/10 px-3 py-2 text-sm outline-none focus:border-ca"
              />
            </label>
            <Link to="/forgot-password" className="-mt-1 text-right text-xs text-ca hover:underline">
              {t("login.mot_de_passe_oublie")}
            </Link>
            {error && <p className="text-sm text-status-dangerText">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="mt-2 rounded-cid bg-ca py-2.5 text-sm font-semibold text-white transition hover:bg-cad disabled:opacity-60"
            >
              {loading ? t("login.loading") : t("login.submit")}
            </button>
            <p className="text-center text-xs text-text-tertiary">
              {t("register.pas_de_compte")}{" "}
              <Link to="/register" className="font-medium text-ca hover:underline">
                {t("register.creer_compte")}
              </Link>
            </p>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="flex flex-col gap-3">
            <p className="text-sm text-text-secondary">
              {method === "totp" ? t("twofa.enter_code_totp") : t("twofa.enter_code_email")}
            </p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-1 w-full rounded-cid border border-black/10 px-3 py-2 text-center text-lg tracking-[0.4em] outline-none focus:border-ca"
              placeholder="000000"
            />
            {totpAvailable && (
              <button
                type="button"
                className="text-xs text-ca underline"
                onClick={async () => {
                  setMethod(method === "totp" ? "email_otp" : "totp");
                  if (method === "totp" && loginTicket) await sendOtp(loginTicket);
                }}
              >
                {method === "totp" ? t("twofa.use_email_instead") : t("twofa.use_totp_instead")}
              </button>
            )}
            {error && <p className="text-sm text-status-dangerText">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="mt-2 rounded-cid bg-ca py-2.5 text-sm font-semibold text-white transition hover:bg-cad disabled:opacity-60"
            >
              {loading ? t("login.loading") : t("twofa.submit")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
