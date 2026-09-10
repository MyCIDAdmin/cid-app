import { apiClient } from "./client";
import type { CidUser } from "../store/authStore";

export interface LoginResponse {
  requires_2fa?: boolean;
  login_ticket?: string;
  totp_available?: boolean;
  access?: string;
  refresh?: string;
  user?: CidUser;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const { data } = await apiClient.post<LoginResponse>("/auth/login/", { email, password });
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
