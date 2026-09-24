import { describe, expect, it, vi } from "vitest";

import { apiClient } from "./client";
import { login } from "./auth";

vi.mock("./client", () => ({
  apiClient: { post: vi.fn() },
}));

vi.mock("../utils/deviceId", () => ({
  getDeviceId: vi.fn(() => "device-abc-123"),
}));

describe("login", () => {
  // task #218 (2026-09-24) : "une seule session active par appareil" — le backend a besoin de
  // `device_id` pour retrouver et révoquer une session encore active sur ce même appareil
  // (voir apps.accounts.services.enforce_single_session_per_device côté backend). Sans ce champ
  // dans le payload, la fonctionnalité entière est silencieusement inopérante.
  it("envoie device_id (utils/deviceId) avec email/mot de passe", async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { access: "a", refresh: "r" } });

    await login("membre@example.com", "Password123!");

    expect(apiClient.post).toHaveBeenCalledWith("/auth/login/", {
      email: "membre@example.com",
      password: "Password123!",
      device_id: "device-abc-123",
    });
  });
});
