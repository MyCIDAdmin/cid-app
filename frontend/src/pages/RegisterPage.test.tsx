import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../test/renderWithProviders";
import * as authApi from "../api/auth";
import RegisterPage from "./RegisterPage";

vi.mock("../api/auth", async () => {
  const actual = await vi.importActual<typeof authApi>("../api/auth");
  return {
    ...actual,
    register: vi.fn(),
  };
});

function remplirFormulaireValide() {
  fireEvent.input(screen.getByLabelText("register.email"), {
    target: { value: "nouveau@example.com" },
  });
  fireEvent.input(screen.getByLabelText("register.password"), {
    target: { value: "Password123!" },
  });
  fireEvent.input(screen.getByLabelText("register.confirm_password"), {
    target: { value: "Password123!" },
  });
  fireEvent.click(screen.getByLabelText("register.consentement_rgpd"));
}

describe("RegisterPage", () => {
  beforeEach(() => {
    vi.mocked(authApi.register).mockReset();
  });

  it("affiche une erreur si le consentement RGPD n'est pas coché", async () => {
    renderWithProviders(<RegisterPage />);

    fireEvent.input(screen.getByLabelText("register.email"), {
      target: { value: "nouveau@example.com" },
    });
    fireEvent.input(screen.getByLabelText("register.password"), {
      target: { value: "Password123!" },
    });
    fireEvent.input(screen.getByLabelText("register.confirm_password"), {
      target: { value: "Password123!" },
    });

    fireEvent.click(screen.getByText("register.submit"));

    expect(await screen.findByText("register.error_rgpd_requis")).toBeInTheDocument();
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it("affiche une erreur si les mots de passe ne correspondent pas", async () => {
    renderWithProviders(<RegisterPage />);

    fireEvent.input(screen.getByLabelText("register.email"), {
      target: { value: "nouveau@example.com" },
    });
    fireEvent.input(screen.getByLabelText("register.password"), {
      target: { value: "Password123!" },
    });
    fireEvent.input(screen.getByLabelText("register.confirm_password"), {
      target: { value: "Autrechose123!" },
    });
    fireEvent.click(screen.getByLabelText("register.consentement_rgpd"));

    fireEvent.click(screen.getByText("register.submit"));

    expect(await screen.findByText("register.error_password_mismatch")).toBeInTheDocument();
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it("crée le compte et affiche la confirmation de succès", async () => {
    vi.mocked(authApi.register).mockResolvedValue(undefined);

    renderWithProviders(<RegisterPage />);
    remplirFormulaireValide();

    fireEvent.click(screen.getByText("register.submit"));

    await waitFor(() =>
      expect(authApi.register).toHaveBeenCalledWith({
        email: "nouveau@example.com",
        password: "Password123!",
        langue_preferee: "fr",
        consentement_rgpd: true,
      }),
    );

    expect(await screen.findByText("register.succes_titre")).toBeInTheDocument();
    expect(screen.getByText("register.succes_retour_connexion")).toBeInTheDocument();
  });

  it("affiche l'erreur serveur en cas d'échec (ex. email déjà utilisé)", async () => {
    vi.mocked(authApi.register).mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: "Cet email est déjà utilisé." } },
    });

    renderWithProviders(<RegisterPage />);
    remplirFormulaireValide();

    fireEvent.click(screen.getByText("register.submit"));

    expect(await screen.findByText("Cet email est déjà utilisé.")).toBeInTheDocument();
  });
});
