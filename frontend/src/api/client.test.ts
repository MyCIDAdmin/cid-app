import type { AxiosRequestConfig, InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useAuthStore } from "../store/authStore";
import { apiClient } from "./client";

describe("apiClient — Token-Weitergabe", () => {
  const originalAdapter = apiClient.defaults.adapter;
  let gesehen: InternalAxiosRequestConfig | null = null;

  beforeEach(() => {
    gesehen = null;
    useAuthStore.setState({ accessToken: "geheim-token" });
    apiClient.defaults.adapter = async (config) => {
      gesehen = config;
      return { data: {}, status: 200, statusText: "OK", headers: {}, config };
    };
  });

  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter;
    useAuthStore.setState({ accessToken: null });
  });

  async function rufe(cfg: AxiosRequestConfig) {
    await apiClient.request(cfg);
    return gesehen?.headers?.Authorization;
  }

  it("sendet das Token an relative API-Pfade", async () => {
    expect(await rufe({ url: "/membres/" })).toBe("Bearer geheim-token");
  });

  it("sendet das Token nie an absolute Fremd-URLs", async () => {
    expect(await rufe({ url: "https://evil.example/steal" })).toBeUndefined();
  });
});
