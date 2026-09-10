import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import type { Membre } from "../../types/membre";
import * as useMembresHooks from "../../hooks/useMembres";
import MembreFormPage from "./MembreFormPage";

vi.mock("../../hooks/useMembres", async () => {
  const actual = await vi.importActual<typeof useMembresHooks>("../../hooks/useMembres");
  return {
    ...actual,
    useMembre: vi.fn(),
    useCreateMembre: vi.fn(),
    useUpdateMembre: vi.fn(),
  };
});

const membreCree: Membre = {
  id: "m9",
  user: null,
  numero_membre: "CA-2024-009",
  prenom: "Ines",
  nom: "Trabelsi",
  date_naissance: "1995-03-02",
  sexe: "femme",
  email: "ines@example.com",
  telephone: "+49 176 1111111",
  cin: "87654321",
  passeport: null,
  pays: "DE",
  adresse_de: "Beispielweg 2",
  code_postal_de: "10117",
  ville_de: "Hambourg",
  land_de: "HH",
  ville_origine_tn: "Tunis",
  gouvernorat_tn: "Tunis",
  statut: "en_attente",
  date_adhesion: "2024-02-01",
  photo: null,
  created_at: "2024-02-01T00:00:00Z",
  updated_at: "2024-02-01T00:00:00Z",
};

describe("MembreFormPage (création)", () => {
  beforeEach(() => {
    vi.mocked(useMembresHooks.useMembre).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useMembresHooks.useMembre>);
    vi.mocked(useMembresHooks.useUpdateMembre).mockReturnValue({
      mutateAsync: vi.fn(),
    } as unknown as ReturnType<typeof useMembresHooks.useUpdateMembre>);
  });

  it("affiche des erreurs de validation quand les champs requis sont vides", async () => {
    vi.mocked(useMembresHooks.useCreateMembre).mockReturnValue({
      mutateAsync: vi.fn(),
    } as unknown as ReturnType<typeof useMembresHooks.useCreateMembre>);

    renderWithProviders(<MembreFormPage />, { route: "/membres/nouveau", path: "/membres/nouveau" });

    fireEvent.click(screen.getByText("formulaire.enregistrer"));

    await waitFor(() => {
      expect(screen.getAllByText("formulaire.champ_requis").length).toBeGreaterThan(0);
    });
  });

  it("soumet le formulaire rempli et navigue vers la fiche créée", async () => {
    const mutateAsync = vi.fn().mockResolvedValue(membreCree);
    vi.mocked(useMembresHooks.useCreateMembre).mockReturnValue({
      mutateAsync,
    } as unknown as ReturnType<typeof useMembresHooks.useCreateMembre>);

    renderWithProviders(<MembreFormPage />, { route: "/membres/nouveau", path: "/membres/nouveau" });

    fireEvent.change(screen.getByLabelText("champ.prenom", { exact: false }), {
      target: { value: "Ines" },
    });
    fireEvent.change(screen.getByLabelText("champ.nom", { exact: false }), {
      target: { value: "Trabelsi" },
    });
    fireEvent.change(screen.getByLabelText("champ.date_naissance", { exact: false }), {
      target: { value: "1995-03-02" },
    });
    fireEvent.change(screen.getByLabelText("champ.email", { exact: false }), {
      target: { value: "ines@example.com" },
    });
    fireEvent.change(screen.getByLabelText("champ.telephone", { exact: false }), {
      target: { value: "+49 176 1111111" },
    });
    fireEvent.change(screen.getByLabelText("champ.cin", { exact: false }), {
      target: { value: "87654321" },
    });
    fireEvent.change(screen.getByLabelText("champ.adresse_de", { exact: false }), {
      target: { value: "Beispielweg 2" },
    });
    fireEvent.change(screen.getByLabelText("champ.ville_de", { exact: false }), {
      target: { value: "Hambourg" },
    });
    fireEvent.change(screen.getByLabelText("champ.date_adhesion", { exact: false }), {
      target: { value: "2024-02-01" },
    });

    fireEvent.click(screen.getByText("formulaire.enregistrer"));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({
      prenom: "Ines",
      nom: "Trabelsi",
      email: "ines@example.com",
      cin: "87654321",
    });

    await waitFor(() => expect(screen.getByTestId("route-fallback")).toBeInTheDocument());
  });

  it("masque les champs d'adresse allemande et les rend non requis pour un pays étranger", async () => {
    const mutateAsync = vi.fn().mockResolvedValue(membreCree);
    vi.mocked(useMembresHooks.useCreateMembre).mockReturnValue({
      mutateAsync,
    } as unknown as ReturnType<typeof useMembresHooks.useCreateMembre>);

    renderWithProviders(<MembreFormPage />, { route: "/membres/nouveau", path: "/membres/nouveau" });

    fireEvent.change(screen.getByLabelText("champ.pays", { exact: false }), {
      target: { value: "FR" },
    });

    expect(screen.queryByLabelText("champ.adresse_de", { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("champ.ville_de", { exact: false })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("champ.prenom", { exact: false }), {
      target: { value: "Ines" },
    });
    fireEvent.change(screen.getByLabelText("champ.nom", { exact: false }), {
      target: { value: "Trabelsi" },
    });
    fireEvent.change(screen.getByLabelText("champ.date_naissance", { exact: false }), {
      target: { value: "1995-03-02" },
    });
    fireEvent.change(screen.getByLabelText("champ.email", { exact: false }), {
      target: { value: "ines@example.com" },
    });
    fireEvent.change(screen.getByLabelText("champ.telephone", { exact: false }), {
      target: { value: "+33 6 11 11 11 11" },
    });
    fireEvent.change(screen.getByLabelText("champ.cin", { exact: false }), {
      target: { value: "87654321" },
    });
    fireEvent.change(screen.getByLabelText("champ.date_adhesion", { exact: false }), {
      target: { value: "2024-02-01" },
    });

    fireEvent.click(screen.getByText("formulaire.enregistrer"));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({ pays: "FR" });
  });
});
