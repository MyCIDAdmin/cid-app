import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "../store/authStore";
import { abmelden } from "./abmelden";
import { apiClient } from "./client";

describe("abmelden", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("widerruft das Refresh-Token und leert die Sitzung", () => {
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ data: {} });
    const logout = vi.fn();
    vi.spyOn(useAuthStore, "getState").mockReturnValue({
      refreshToken: "r-123",
      logout,
    } as unknown as ReturnType<typeof useAuthStore.getState>);
    abmelden();
    expect(post).toHaveBeenCalledWith("/auth/logout/", { refresh: "r-123" });
    expect(logout).toHaveBeenCalled();
  });

  it("loggt auch bei Netzwerkfehler und ohne Token lokal aus", async () => {
    const post = vi.spyOn(apiClient, "post").mockRejectedValue(new Error("offline"));
    const logout = vi.fn();
    const state = vi.spyOn(useAuthStore, "getState");
    state.mockReturnValue({ refreshToken: "r", logout } as unknown as ReturnType<
      typeof useAuthStore.getState
    >);
    abmelden();
    await Promise.resolve();
    expect(logout).toHaveBeenCalledTimes(1);
    state.mockReturnValue({ refreshToken: null, logout } as unknown as ReturnType<
      typeof useAuthStore.getState
    >);
    abmelden();
    expect(post).toHaveBeenCalledTimes(1);
    expect(logout).toHaveBeenCalledTimes(2);
  });
});
