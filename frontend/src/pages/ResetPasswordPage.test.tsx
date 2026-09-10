import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../test/renderWithProviders";
import * as authApi from "../api/auth";
import ResetPasswordPage from "./ResetPasswordPage";

vi.mock("../api/auth", async () => {
  const actual = await vi.importActual<typeof authApi>("../api/auth");
  return {
    ...actual,
    confirmPasswordReset: vi.fn(),
  };
});

function renderAvecToken(token = "jeton-abc123") {
  return renderWithProviders(<ResetPasswordPage />, {
    route: `/reset-password?token=${token}`,
    path: "/reset-password",
  });
}

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    vi.mocked(authApi.confirmPasswordReset).mockReset();
  });

  it("affiche une erreur si le lien n'a pas de jeton", () => {
    renderWithProviders(<ResetPasswordPage />, { route: "/reset-password", path: "/reset-password" });

    expect(screen.getByText("reset_password.lien_invalide")).toBeInTheDocument();
  });

  it("affiche une erreur si les mots de passe ne correspondent pas", async () => {
    renderAvecToken();

    fireEvent.input(screen.getByLabelText("reset_password.password"), {
      target: { value: "Password123!" },
    });
    fireEvent.input(screen.getByLabelText("reset_password.confirm_password"), {
      target: { value: "Autrechose123!" },
    });
    fireEvent.click(screen.getByText("reset_password.submit"));

    expect(await screen.findByText("reset_password.error_password_mismatch")).toBeInTheDocument();
    expect(authApi.confirmPasswordReset).not.toHaveBeenCalled();
  });

  it("réinitialise le mot de passe et affiche la confirmation", async () => {
    vi.mocked(authApi.confirmPasswordReset).mockResolvedValue({ message: "ok" });

    renderAvecToken("jeton-abc123");

    fireEvent.input(screen.getByLabelText("reset_password.password"), {
      target: { value: "Password123!" },
    });
    fireEvent.input(screen.getByLabelText("reset_password.confirm_password"), {
      target: { value: "Password123!" },
    });
    fireEvent.click(screen.getByText("reset_password.submit"));

    await waitFor(() =>
      expect(authApi.confirmPasswordReset).toHaveBeenCalledWith("jeton-abc123", "Password123!"),
    );
    expect(await screen.findByText("reset_password.succes_titre")).toBeInTheDocument();
  });

  it("affiche l'erreur serveur si le jeton est expiré ou déjà utilisé", async () => {
    vi.mocked(authApi.confirmPasswordReset).mockRejectedValue(new Error("expired"));

    renderAvecToken();

    fireEvent.input(screen.getByLabelText("reset_password.password"), {
      target: { value: "Password123!" },
    });
    fireEvent.input(screen.getByLabelText("reset_password.confirm_password"), {
      target: { value: "Password123!" },
    });
    fireEvent.click(screen.getByText("reset_password.submit"));

    expect(await screen.findByText("reset_password.error_generique")).toBeInTheDocument();
  });
});
