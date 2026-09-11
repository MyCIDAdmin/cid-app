import { beforeEach, describe, expect, it } from "vitest";

import { queryClient } from "../queryClient";
import { setRememberMe, useAuthStore } from "./authStore";

const AUTH_KEY = "cid-auth";

const utilisateur = {
  id: "u1",
  email: "membre@example.com",
  role: "membre" as const,
  langue_preferee: "fr" as const,
};

function attendreEcriturePersist() {
  // Le storage engine de zustand/persist peut écrire au tick suivant.
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("authStore — rester connecté (AHM-50)", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    useAuthStore.setState({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
    });
  });

  it("persiste dans localStorage quand 'rester connecté' est coché (comportement par défaut)", async () => {
    setRememberMe(true);
    useAuthStore.getState().loginSuccess("access", "refresh", utilisateur);
    await attendreEcriturePersist();

    expect(localStorage.getItem(AUTH_KEY)).not.toBeNull();
    expect(sessionStorage.getItem(AUTH_KEY)).toBeNull();
  });

  it("persiste dans sessionStorage quand 'rester connecté' est décoché", async () => {
    setRememberMe(false);
    useAuthStore.getState().loginSuccess("access", "refresh", utilisateur);
    await attendreEcriturePersist();

    expect(sessionStorage.getItem(AUTH_KEY)).not.toBeNull();
    expect(localStorage.getItem(AUTH_KEY)).toBeNull();
  });

  it("migre l'état déjà écrit vers le nouveau storage quand le choix change", async () => {
    setRememberMe(false);
    useAuthStore.getState().loginSuccess("access", "refresh", utilisateur);
    await attendreEcriturePersist();
    expect(sessionStorage.getItem(AUTH_KEY)).not.toBeNull();

    setRememberMe(true);

    expect(localStorage.getItem(AUTH_KEY)).not.toBeNull();
    expect(sessionStorage.getItem(AUTH_KEY)).toBeNull();
  });
});

describe("authStore — vidage du cache React Query au changement d'identité (AHM-51)", () => {
  const CLE_TEST = ["membres", "list"] as const;

  beforeEach(() => {
    useAuthStore.setState({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
    });
  });

  it("loginSuccess() vide le cache React Query hérité d'une session précédente", () => {
    // Données laissées en cache par un compte précédemment connecté dans le
    // même onglet — sans le fix, elles restent visibles au nouveau compte
    // le temps que staleTime expire.
    queryClient.setQueryData(CLE_TEST, { results: [{ id: "m1" }] });

    useAuthStore.getState().loginSuccess("access", "refresh", utilisateur);

    expect(queryClient.getQueryData(CLE_TEST)).toBeUndefined();
  });

  it("logout() vide le cache React Query", () => {
    useAuthStore.getState().loginSuccess("access", "refresh", utilisateur);
    queryClient.setQueryData(CLE_TEST, { results: [{ id: "m1" }] });

    useAuthStore.getState().logout();

    expect(queryClient.getQueryData(CLE_TEST)).toBeUndefined();
  });
});
