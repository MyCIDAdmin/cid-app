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
    confirmRegistration: vi.fn(),
    resendRegistrationCode: vi.fn(),
  };
});

// { exact: false } : les champs requis ajoutent un "*" dans le même <label>
// (voir Champ dans RegisterPage.tsx), donc le texte accessible complet est
// "register.xxx *", pas juste la clé de traduction.
function remplirChampsTexte() {
  fireEvent.input(screen.getByLabelText("register.prenom", { exact: false }), {
    target: { value: "Sami" },
  });
  fireEvent.input(screen.getByLabelText("register.nom", { exact: false }), {
    target: { value: "Ben Salah" },
  });
  fireEvent.input(screen.getByLabelText("register.date_naissance", { exact: false }), {
    target: { value: "1990-05-12" },
  });
  fireEvent.input(screen.getByLabelText("register.cin", { exact: false }), {
    target: { value: "12345678" },
  });
  fireEvent.input(screen.getByLabelText("register.email", { exact: false }), {
    target: { value: "nouveau@example.com" },
  });
  fireEvent.input(screen.getByLabelText("register.telephone", { exact: false }), {
    target: { value: "+49123456789" },
  });
  fireEvent.input(screen.getByLabelText("register.adresse_de", { exact: false }), {
    target: { value: "Friedrichstr. 42" },
  });
  fireEvent.input(screen.getByLabelText("register.ville_de", { exact: false }), {
    target: { value: "Berlin" },
  });
  fireEvent.input(screen.getByLabelText("register.password", { exact: false }), {
    target: { value: "Password123!" },
  });
  fireEvent.input(screen.getByLabelText("register.confirm_password", { exact: false }), {
    target: { value: "Password123!" },
  });
}

function remplirFormulaireValide() {
  remplirChampsTexte();
  fireEvent.click(screen.getByLabelText("register.consentement_rgpd"));
}

describe("RegisterPage", () => {
  beforeEach(() => {
    vi.mocked(authApi.register).mockReset();
    vi.mocked(authApi.confirmRegistration).mockReset();
    vi.mocked(authApi.resendRegistrationCode).mockReset();
  });

  it("affiche une erreur si le consentement RGPD n'est pas coché", async () => {
    renderWithProviders(<RegisterPage />);
    remplirChampsTexte();

    fireEvent.click(screen.getByText("register.submit"));

    expect(await screen.findByText("register.error_rgpd_requis")).toBeInTheDocument();
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it("affiche une erreur si les mots de passe ne correspondent pas", async () => {
    renderWithProviders(<RegisterPage />);
    remplirFormulaireValide();
    fireEvent.input(screen.getByLabelText("register.confirm_password", { exact: false }), {
      target: { value: "Autrechose123!" },
    });

    fireEvent.click(screen.getByText("register.submit"));

    expect(await screen.findByText("register.error_password_mismatch")).toBeInTheDocument();
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it("envoie le formulaire complet puis confirme le code reçu par email", async () => {
    vi.mocked(authApi.register).mockResolvedValue(undefined);
    vi.mocked(authApi.confirmRegistration).mockResolvedValue({ message: "ok" });

    renderWithProviders(<RegisterPage />);
    remplirFormulaireValide();
    fireEvent.click(screen.getByText("register.submit"));

    await waitFor(() =>
      expect(authApi.register).toHaveBeenCalledWith({
        email: "nouveau@example.com",
        password: "Password123!",
        langue_preferee: "fr",
        consentement_rgpd: true,
        prenom: "Sami",
        nom: "Ben Salah",
        date_naissance: "1990-05-12",
        sexe: "non_renseigne",
        cin: "12345678",
        passeport: undefined,
        telephone: "+49123456789",
        adresse_de: "Friedrichstr. 42",
        code_postal_de: undefined,
        ville_de: "Berlin",
        land_de: undefined,
        ville_origine_tn: undefined,
        gouvernorat_tn: undefined,
      }),
    );

    // Étape 2 : saisie du code de confirmation.
    expect(await screen.findByText(/confirm_message/)).toBeInTheDocument();
    fireEvent.input(screen.getByLabelText("register.confirm_code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByText("register.confirm_submit"));

    await waitFor(() =>
      expect(authApi.confirmRegistration).toHaveBeenCalledWith("nouveau@example.com", "123456"),
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

  it("affiche une erreur si le code de confirmation est invalide", async () => {
    vi.mocked(authApi.register).mockResolvedValue(undefined);
    vi.mocked(authApi.confirmRegistration).mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: "Code invalide ou expiré." } },
    });

    renderWithProviders(<RegisterPage />);
    remplirFormulaireValide();
    fireEvent.click(screen.getByText("register.submit"));

    await screen.findByText(/confirm_message/);
    fireEvent.input(screen.getByLabelText("register.confirm_code"), {
      target: { value: "000000" },
    });
    fireEvent.click(screen.getByText("register.confirm_submit"));

    expect(await screen.findByText("Code invalide ou expiré.")).toBeInTheDocument();
  });

  // Ajouté le 2026-09-21 (retour utilisateur : "Anmeldung: Datenschutzhinweis hinzufügen.
  // Benutzer soll den bei der Registrierung annehmen") — voir DatenschutzhinweisModal.
  it("affiche le Datenschutzhinweis dans une modale au clic sur le lien dédié", () => {
    renderWithProviders(<RegisterPage />);

    expect(screen.queryByText("register.datenschutz.titre")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("register.lire_datenschutzhinweis"));

    expect(screen.getByText("register.datenschutz.titre")).toBeInTheDocument();
    expect(screen.getByText("register.datenschutz.intro")).toBeInTheDocument();

    fireEvent.click(screen.getByText("register.datenschutz.fermer"));

    expect(screen.queryByText("register.datenschutz.titre")).not.toBeInTheDocument();
  });

  // Non-régression : le lien vers le Datenschutzhinweis est HORS du <label> de la case à cocher
  // (voir RegisterPage.tsx), donc ne doit jamais changer son nom accessible.
  it("la case à cocher du consentement RGPD reste indépendamment ciblable après l'ajout du lien", () => {
    renderWithProviders(<RegisterPage />);

    expect(screen.getByLabelText("register.consentement_rgpd")).toBeInTheDocument();
  });

  it("permet de renvoyer le code de confirmation", async () => {
    vi.mocked(authApi.register).mockResolvedValue(undefined);
    vi.mocked(authApi.resendRegistrationCode).mockResolvedValue({ message: "Nouveau code envoyé." });

    renderWithProviders(<RegisterPage />);
    remplirFormulaireValide();
    fireEvent.click(screen.getByText("register.submit"));

    await screen.findByText(/confirm_message/);
    fireEvent.click(screen.getByText("register.confirm_renvoyer"));

    await waitFor(() => expect(authApi.resendRegistrationCode).toHaveBeenCalledWith("nouveau@example.com"));
    expect(await screen.findByText("Nouveau code envoyé.")).toBeInTheDocument();
  });
});
