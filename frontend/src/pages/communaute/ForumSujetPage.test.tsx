import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import { useAuthStore } from "../../store/authStore";
import type { ReponseForum, Sujet } from "../../types/communaute";
import ForumSujetPage from "./ForumSujetPage";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return {
    ...actual,
    useSujet: vi.fn(),
    useEpinglerSujet: vi.fn(),
    useVerrouillerSujet: vi.fn(),
    useMasquerSujet: vi.fn(),
    useSupprimerSujet: vi.fn(),
    useRepondreAuSujet: vi.fn(),
    useReagieren: vi.fn(),
    useBesteAntwort: vi.fn(),
    useSupprimerReponseForum: vi.fn(),
    useMasquerReponseForum: vi.fn(),
    useRechercherMembres: vi.fn(),
  };
});

const membre = {
  id: "u1",
  email: "membre@example.com",
  role: "membre" as const,
  langue_preferee: "fr" as const,
};

const bureauAdmin = { ...membre, id: "u2", role: "bureau_admin" as const };

const auteurA = { id: "m1", prenom: "Lina", nom: "Khemiri", photo: null };

function sujet(overrides: Partial<Sujet> = {}): Sujet {
  return {
    id: "s1",
    auteur: auteurA,
    categorie: "general",
    titre: "Discussion générale",
    contenu: "Contenu du sujet.",
    est_epingle: false,
    est_verrouille: false,
    est_masque: false,
    motif_masquage: "",
    created_at: "2026-01-01T10:00:00Z",
    updated_at: "2026-01-01T10:00:00Z",
    nombre_reponses: 0,
    nombre_reaktionen: 0,
    reaktionen: [],
    letzte_aktivitaet: "2026-01-01T10:00:00Z",
    letzte_antwort_von: null,
    beste_antwort: null,
    reponses: [],
    est_auteur: false,
    ...overrides,
  };
}

const auteurB = { id: "m2", prenom: "Karim", nom: "Ben Ali", photo: null };

function reponse(overrides: Partial<ReponseForum> = {}): ReponseForum {
  return {
    id: "r1",
    sujet: "s1",
    auteur: auteurB,
    contenu: "Eine Antwort",
    est_masquee: false,
    created_at: "2026-01-01T11:00:00Z",
    est_auteur: false,
    repond_a: null,
    zitat: null,
    ist_beste: false,
    reaktionen: [],
    ...overrides,
  };
}

function zeigeSujet(s: Sujet) {
  vi.mocked(useCommunauteHooks.useSujet).mockReturnValue({
    data: s,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useCommunauteHooks.useSujet>);
  return renderSujet();
}

function mutationMock<T>(): T {
  return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false } as unknown as T;
}

function renderSujet() {
  return renderWithProviders(<ForumSujetPage />, { route: "/forum/s1", path: "/forum/:id" });
}

describe("ForumSujetPage", () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: membre,
      isAuthenticated: true,
    });
    vi.mocked(useCommunauteHooks.useEpinglerSujet).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useEpinglerSujet>>(),
    );
    vi.mocked(useCommunauteHooks.useVerrouillerSujet).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useVerrouillerSujet>>(),
    );
    vi.mocked(useCommunauteHooks.useMasquerSujet).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useMasquerSujet>>(),
    );
    vi.mocked(useCommunauteHooks.useSupprimerSujet).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useSupprimerSujet>>(),
    );
    vi.mocked(useCommunauteHooks.useRepondreAuSujet).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useRepondreAuSujet>>(),
    );
    vi.mocked(useCommunauteHooks.useSupprimerReponseForum).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useSupprimerReponseForum>>(),
    );
    vi.mocked(useCommunauteHooks.useMasquerReponseForum).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useMasquerReponseForum>>(),
    );
    vi.mocked(useCommunauteHooks.useReagieren).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useReagieren>>(),
    );
    vi.mocked(useCommunauteHooks.useBesteAntwort).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useBesteAntwort>>(),
    );
    vi.mocked(useCommunauteHooks.useRechercherMembres).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useRechercherMembres>);
  });

  it("affiche le sujet et ses réponses", () => {
    vi.mocked(useCommunauteHooks.useSujet).mockReturnValue({
      data: sujet({
        reponses: [
          {
            id: "r1",
            sujet: "s1",
            auteur: auteurA,
            contenu: "Une réponse",
            est_masquee: false,
            created_at: "2026-01-01T11:00:00Z",
            est_auteur: false,
            repond_a: null,
            zitat: null,
            ist_beste: false,
            reaktionen: [],
          },
        ],
      }),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useSujet>);

    renderSujet();

    expect(screen.getByText("Discussion générale")).toBeInTheDocument();
    expect(screen.getByText("Une réponse")).toBeInTheDocument();
  });

  it("affiche le bouton de partage externe du sujet", () => {
    // Retour utilisateur du 2026-09-29, module "Forum" : "Es soll möglich sein Elemente in
    // Social Media zu teilen" — voir ShareButton.tsx et son docstring.
    vi.mocked(useCommunauteHooks.useSujet).mockReturnValue({
      data: sujet(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useSujet>);

    renderSujet();

    expect(screen.getByLabelText("partage.bouton_aria")).toBeInTheDocument();
  });

  it("un membre normal ne voit pas les actions de modération", () => {
    vi.mocked(useCommunauteHooks.useSujet).mockReturnValue({
      data: sujet(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useSujet>);

    renderSujet();

    expect(screen.queryByText("forum.epingler")).not.toBeInTheDocument();
    expect(screen.queryByText("forum.verrouiller")).not.toBeInTheDocument();
  });

  it("un bureau admin voit et peut utiliser les actions de modération", () => {
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: bureauAdmin,
      isAuthenticated: true,
    });
    const epingler = mutationMock<ReturnType<typeof useCommunauteHooks.useEpinglerSujet>>();
    vi.mocked(useCommunauteHooks.useEpinglerSujet).mockReturnValue(epingler);
    vi.mocked(useCommunauteHooks.useSujet).mockReturnValue({
      data: sujet(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useSujet>);

    renderSujet();

    fireEvent.click(screen.getByText("forum.epingler"));
    expect(epingler.mutate).toHaveBeenCalledWith("s1");
  });

  it("un sujet verrouillé masque le formulaire de réponse", () => {
    vi.mocked(useCommunauteHooks.useSujet).mockReturnValue({
      data: sujet({ est_verrouille: true }),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useSujet>);

    renderSujet();

    expect(screen.getByText("forum.sujet_verrouille_message")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("forum.placeholder_reponse")).not.toBeInTheDocument();
  });

  it("soumet une réponse au sujet", () => {
    const repondre = mutationMock<ReturnType<typeof useCommunauteHooks.useRepondreAuSujet>>();
    vi.mocked(useCommunauteHooks.useRepondreAuSujet).mockReturnValue(repondre);
    vi.mocked(useCommunauteHooks.useSujet).mockReturnValue({
      data: sujet(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useSujet>);

    renderSujet();

    fireEvent.change(screen.getByPlaceholderText("forum.placeholder_reponse"), {
      target: { value: "Ma réponse" },
    });
    fireEvent.click(screen.getByText("forum.repondre"));

    expect(repondre.mutate).toHaveBeenCalledWith(
      { sujetId: "s1", contenu: "Ma réponse", mentions: [] },
      expect.anything(),
    );
  });

  it("propose une mention '@' dans le champ de réponse et l'inclut dans mentions à l'envoi", () => {
    // Ajouté le 2026-09-29 — voir hooks/useMentionAutocomplete.ts.
    const repondre = mutationMock<ReturnType<typeof useCommunauteHooks.useRepondreAuSujet>>();
    vi.mocked(useCommunauteHooks.useRepondreAuSujet).mockReturnValue(repondre);
    vi.mocked(useCommunauteHooks.useSujet).mockReturnValue({
      data: sujet(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useSujet>);
    vi.mocked(useCommunauteHooks.useRechercherMembres).mockReturnValue({
      data: [{ id: "m9", prenom: "Cible", nom: "Test", photo: null }],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useRechercherMembres>);

    renderSujet();

    fireEvent.change(screen.getByPlaceholderText("forum.placeholder_reponse"), {
      target: { value: "Salut @Ci" },
    });
    fireEvent.click(screen.getByText("Cible Test"));
    fireEvent.click(screen.getByText("forum.repondre"));

    expect(repondre.mutate).toHaveBeenCalledWith(
      { sujetId: "s1", contenu: "Salut @Cible ", mentions: ["m9"] },
      expect.anything(),
    );
  });

  it("setzt eine Reaktion auf eine Antwort und auf das Thema", () => {
    const reagieren = mutationMock<ReturnType<typeof useCommunauteHooks.useReagieren>>();
    vi.mocked(useCommunauteHooks.useReagieren).mockReturnValue(reagieren);
    zeigeSujet(sujet({ reponses: [reponse()] }));

    const knoepfe = screen.getAllByLabelText("reaktionen.hinzufuegen");
    expect(knoepfe).toHaveLength(2); // Thema + eine Antwort
    fireEvent.click(knoepfe[1]);
    fireEvent.click(screen.getByText("🙏"));
    expect(reagieren.mutate).toHaveBeenCalledWith({ id: "r1", emoji: "🙏" });
  });

  it("Zitat-Antwort : zeigt den Bezug, schickt repondA mit und schließt sich danach", () => {
    const repondre = mutationMock<ReturnType<typeof useCommunauteHooks.useRepondreAuSujet>>();
    vi.mocked(useCommunauteHooks.useRepondreAuSujet).mockReturnValue(repondre);
    zeigeSujet(sujet({ reponses: [reponse({ contenu: "Wohnung gefunden!" })] }));

    fireEvent.click(screen.getByText(/forum.zitieren/));
    expect(screen.getByText("forum.antwort_auf")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("forum.placeholder_reponse"), {
      target: { value: "Glückwunsch" },
    });
    fireEvent.click(screen.getByText("forum.repondre"));
    expect(repondre.mutate).toHaveBeenCalledWith(
      { sujetId: "s1", contenu: "Glückwunsch", mentions: [], repondA: "r1" },
      expect.anything(),
    );

    // Schließen ohne Senden entfernt den Bezug.
    fireEvent.click(screen.getByLabelText("forum.zitat_abbrechen"));
    expect(screen.queryByText("forum.antwort_auf")).not.toBeInTheDocument();
  });

  it("zeigt das Zitat in der Blase", () => {
    zeigeSujet(
      sujet({
        reponses: [
          reponse({ id: "r1", contenu: "Erste" }),
          reponse({
            id: "r2",
            contenu: "Zweite",
            repond_a: "r1",
            zitat: { id: "r1", auteur: { prenom: "Karim", nom: "Ben Ali" }, auszug: "Erste" },
          }),
        ],
      }),
    );

    const zitat = document.querySelector('a[href="#antwort-r1"]');
    expect(zitat).not.toBeNull();
    expect(zitat).toHaveTextContent("Karim Ben Ali");
    expect(zitat).toHaveTextContent("Erste");
  });

  it("der Themenersteller wählt die beste Antwort ; ein Fremder sieht den Knopf nicht", () => {
    const beste = mutationMock<ReturnType<typeof useCommunauteHooks.useBesteAntwort>>();
    vi.mocked(useCommunauteHooks.useBesteAntwort).mockReturnValue(beste);

    const { unmount } = zeigeSujet(sujet({ est_auteur: false, reponses: [reponse()] }));
    expect(screen.queryByText(/forum.beste_antwort_waehlen/)).not.toBeInTheDocument();
    unmount();

    zeigeSujet(sujet({ est_auteur: true, reponses: [reponse()] }));
    fireEvent.click(screen.getByText(/forum.beste_antwort_waehlen/));
    expect(beste.mutate).toHaveBeenCalledWith({ sujetId: "s1", reponseId: "r1" });
  });

  it("markiert die beste Antwort und löst die Markierung wieder", () => {
    const beste = mutationMock<ReturnType<typeof useCommunauteHooks.useBesteAntwort>>();
    vi.mocked(useCommunauteHooks.useBesteAntwort).mockReturnValue(beste);
    zeigeSujet(
      sujet({
        est_auteur: true,
        beste_antwort: "r1",
        reponses: [reponse({ ist_beste: true })],
      }),
    );

    expect(screen.getByText(/forum.beste_antwort_badge/)).toBeInTheDocument();
    expect(screen.getAllByText(/forum.geloest/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("forum.beste_antwort_loesen"));
    expect(beste.mutate).toHaveBeenCalledWith({ sujetId: "s1", reponseId: null });
  });

  it("eine eigene Antwort kann nicht als beste Antwort markiert werden", () => {
    zeigeSujet(sujet({ est_auteur: true, reponses: [reponse({ est_auteur: true })] }));
    expect(screen.queryByText(/forum.beste_antwort_waehlen/)).not.toBeInTheDocument();
  });

  it("fügt ein Emoji in das Antwortfeld ein", () => {
    zeigeSujet(sujet());
    fireEvent.click(screen.getByLabelText("chats.emoji"));
    fireEvent.click(screen.getAllByRole("button", { name: "😀" })[0]);
    expect(screen.getByPlaceholderText("forum.placeholder_reponse")).toHaveValue("😀");
  });

  it("merkt sich das Thema als gesehen (nur dieses Gerät)", () => {
    window.localStorage.clear();
    zeigeSujet(sujet());
    const gesehen = JSON.parse(window.localStorage.getItem("forum:gesehen:u1") ?? "{}");
    expect(gesehen.s1).toBeGreaterThan(0);
  });

  it("gesperrtes Thema : kein Zitieren, kein Antwortfeld", () => {
    zeigeSujet(sujet({ est_verrouille: true, reponses: [reponse()] }));
    expect(screen.queryByText(/forum.zitieren/)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("forum.placeholder_reponse")).not.toBeInTheDocument();
  });
});
