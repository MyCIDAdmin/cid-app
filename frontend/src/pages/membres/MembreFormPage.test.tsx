import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import { useAuthStore } from "../../store/authStore";
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
    // La route /membres/nouveau est de toute façon gated RH+ (App.tsx) —
    // un utilisateur RH ici reflète les conditions réelles d'accès.
    useAuthStore.setState({
      user: { id: "rh1", email: "rh@example.com", role: "rh", langue_preferee: "fr" },
    });
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

describe("MembreFormPage (édition, AHM-51 — un Membre modifie sa propre fiche)", () => {
  const maFiche: Membre = { ...membreCree, id: "m1", user: "u2" };

  beforeEach(() => {
    vi.mocked(useMembresHooks.useCreateMembre).mockReturnValue({
      mutateAsync: vi.fn(),
    } as unknown as ReturnType<typeof useMembresHooks.useCreateMembre>);
  });

  it("masque les champs administratifs (statut, date d'adhésion) pour un Membre", () => {
    useAuthStore.setState({
      user: { id: "u2", email: "membre@example.com", role: "membre", langue_preferee: "fr" },
    });
    vi.mocked(useMembresHooks.useMembre).mockReturnValue({
      data: maFiche,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useMembresHooks.useMembre>);
    vi.mocked(useMembresHooks.useUpdateMembre).mockReturnValue({
      mutateAsync: vi.fn(),
    } as unknown as ReturnType<typeof useMembresHooks.useUpdateMembre>);

    renderWithProviders(<MembreFormPage />, {
      route: "/membres/m1/modifier",
      path: "/membres/:id/modifier",
    });

    expect(screen.queryByLabelText("champ.statut", { exact: false })).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("champ.date_adhesion", { exact: false }),
    ).not.toBeInTheDocument();
    // Les champs personnels restent modifiables.
    expect(screen.getByLabelText("champ.telephone", { exact: false })).toBeInTheDocument();
  });

  it("un Membre peut soumettre la modification de ses propres champs personnels", async () => {
    useAuthStore.setState({
      user: { id: "u2", email: "membre@example.com", role: "membre", langue_preferee: "fr" },
    });
    vi.mocked(useMembresHooks.useMembre).mockReturnValue({
      data: maFiche,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useMembresHooks.useMembre>);
    const mutateAsync = vi.fn().mockResolvedValue({ ...maFiche, telephone: "+49 30 9999999" });
    vi.mocked(useMembresHooks.useUpdateMembre).mockReturnValue({
      mutateAsync,
    } as unknown as ReturnType<typeof useMembresHooks.useUpdateMembre>);

    renderWithProviders(<MembreFormPage />, {
      route: "/membres/m1/modifier",
      path: "/membres/:id/modifier",
    });

    fireEvent.change(screen.getByLabelText("champ.telephone", { exact: false }), {
      target: { value: "+49 30 9999999" },
    });
    fireEvent.click(screen.getByText("formulaire.enregistrer"));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({ telephone: "+49 30 9999999" });
  });

  it("affiche les champs administratifs pour RH+ en édition", () => {
    useAuthStore.setState({
      user: { id: "rh1", email: "rh@example.com", role: "rh", langue_preferee: "fr" },
    });
    vi.mocked(useMembresHooks.useMembre).mockReturnValue({
      data: maFiche,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useMembresHooks.useMembre>);
    vi.mocked(useMembresHooks.useUpdateMembre).mockReturnValue({
      mutateAsync: vi.fn(),
    } as unknown as ReturnType<typeof useMembresHooks.useUpdateMembre>);

    renderWithProviders(<MembreFormPage />, {
      route: "/membres/m1/modifier",
      path: "/membres/:id/modifier",
    });

    expect(screen.getByLabelText("champ.statut", { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText("champ.date_adhesion", { exact: false })).toBeInTheDocument();
  });

  it("affiche une erreur si la fiche n'est pas accessible (ex. fiche d'un autre Membre)", () => {
    useAuthStore.setState({
      user: { id: "u2", email: "membre@example.com", role: "membre", langue_preferee: "fr" },
    });
    vi.mocked(useMembresHooks.useMembre).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof useMembresHooks.useMembre>);
    vi.mocked(useMembresHooks.useUpdateMembre).mockReturnValue({
      mutateAsync: vi.fn(),
    } as unknown as ReturnType<typeof useMembresHooks.useUpdateMembre>);

    renderWithProviders(<MembreFormPage />, {
      route: "/membres/autre-id/modifier",
      path: "/membres/:id/modifier",
    });

    expect(screen.getByText("fiche.erreur_chargement")).toBeInTheDocument();
  });
});
