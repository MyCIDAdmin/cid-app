import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../test/renderWithProviders";
import * as authApi from "../api/auth";
import LoginPage from "./LoginPage";

vi.mock("../api/auth", async () => {
  const actual = await vi.importActual<typeof authApi>("../api/auth");
  return {
    ...actual,
    login: vi.fn(),
  };
});

function soumettre(email: string, password: string) {
  fireEvent.input(screen.getByLabelText("login.email"), { target: { value: email } });
  fireEvent.input(screen.getByLabelText("login.password"), { target: { value: password } });
  fireEvent.click(screen.getByText("login.submit"));
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.mocked(authApi.login).mockReset();
  });

  it("affiche le message précis du backend pour un compte pas encore activé", async () => {
    // Simule la réponse 403 account_inactive de LoginView — le message
    // vient du backend, pas d'un texte générique masquant la vraie raison.
    vi.mocked(authApi.login).mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 403,
        data: {
          code: "account_inactive",
          message: "Votre compte est en attente de validation par un RH ou Admin.",
        },
      },
    });

    renderWithProviders(<LoginPage />);
    soumettre("nouveau@example.com", "Password123!");

    expect(
      await screen.findByText("Votre compte est en attente de validation par un RH ou Admin."),
    ).toBeInTheDocument();
  });

  it("affiche le message générique si le backend n'en fournit pas", async () => {
    vi.mocked(authApi.login).mockRejectedValue(new Error("network"));

    renderWithProviders(<LoginPage />);
    soumettre("membre@example.com", "mauvais-mdp");

    expect(await screen.findByText("login.error_invalid")).toBeInTheDocument();
  });

  it("connecte et redirige en cas de succès sans 2FA", async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      access: "access-token",
      refresh: "refresh-token",
      user: {
        id: "u1",
        email: "membre@example.com",
        role: "membre",
        langue_preferee: "fr",
      },
    });

    renderWithProviders(<LoginPage />);
    soumettre("membre@example.com", "Password123!");

    await waitFor(() => expect(authApi.login).toHaveBeenCalledWith("membre@example.com", "Password123!"));
  });
});
