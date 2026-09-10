import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../test/renderWithProviders";
import * as authApi from "../api/auth";
import ForgotPasswordPage from "./ForgotPasswordPage";

vi.mock("../api/auth", async () => {
  const actual = await vi.importActual<typeof authApi>("../api/auth");
  return {
    ...actual,
    requestPasswordReset: vi.fn(),
  };
});

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    vi.mocked(authApi.requestPasswordReset).mockReset();
  });

  it("envoie la demande et affiche le message générique de succès", async () => {
    vi.mocked(authApi.requestPasswordReset).mockResolvedValue({ message: "ok" });

    renderWithProviders(<ForgotPasswordPage />);

    fireEvent.input(screen.getByLabelText("forgot_password.email"), {
      target: { value: "membre@example.com" },
    });
    fireEvent.click(screen.getByText("forgot_password.submit"));

    await waitFor(() =>
      expect(authApi.requestPasswordReset).toHaveBeenCalledWith("membre@example.com"),
    );
    expect(await screen.findByText("forgot_password.succes_titre")).toBeInTheDocument();
  });

  it("affiche une erreur si l'envoi échoue", async () => {
    vi.mocked(authApi.requestPasswordReset).mockRejectedValue(new Error("network"));

    renderWithProviders(<ForgotPasswordPage />);

    fireEvent.input(screen.getByLabelText("forgot_password.email"), {
      target: { value: "membre@example.com" },
    });
    fireEvent.click(screen.getByText("forgot_password.submit"));

    expect(await screen.findByText("forgot_password.error_generique")).toBeInTheDocument();
  });
});
