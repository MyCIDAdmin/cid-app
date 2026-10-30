import { fireEvent, screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as chats from "../../hooks/useChats";
import * as communaute from "../../hooks/useCommunaute";
import * as socket from "../../hooks/useChatSocket";
import { useAuthStore } from "../../store/authStore";
import type { ChatListItem } from "../../types/chats";
import ChatsPage from "./ChatsPage";

vi.mock("../../hooks/useChats", async () => {
  const actual = await vi.importActual<typeof chats>("../../hooks/useChats");
  return {
    ...actual,
    useChatListe: vi.fn(),
    useChatDienste: vi.fn(),
    useGruppenMitglieder: vi.fn(),
    useChatEinstellung: vi.fn(),
    useGruppeGelesen: vi.fn(),
    useReagieren: vi.fn(),
    useAnheften: vi.fn(),
    useAbstimmen: vi.fn(),
    useUebersetzen: vi.fn(),
    useMitreisende: vi.fn(),
  };
});
vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof communaute>("../../hooks/useCommunaute");
  return {
    ...actual,
    useMessagesGroupe: vi.fn(),
    useMessagesPrives: vi.fn(),
    useLikerMessageGroupe: vi.fn(),
    useLikerMessagePrive: vi.fn(),
    useSupprimerMessageGroupe: vi.fn(),
    useSupprimerMessagePrive: vi.fn(),
    useGroupe: vi.fn(),
    useQuitterGroupe: vi.fn(),
    useSupprimerGroupe: vi.fn(),
    useInviterAuGroupe: vi.fn(),
    useRechercherMembres: vi.fn(),
    useGroupes: vi.fn(),
    useCreerConversation: vi.fn(),
    useCreerGroupe: vi.fn(),
    useRejoindreGroupe: vi.fn(),
  };
});
vi.mock("../../hooks/useChatSocket", () => ({ useChatSocket: vi.fn() }));
vi.mock("../../hooks/useReisen", () => ({ useReise: vi.fn(() => ({ data: undefined })) }));

const mut = () =>
  ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isError: false }) as never;
const leer = { data: undefined, isLoading: false, isError: false } as never;

function chat(o: Partial<ChatListItem>): ChatListItem {
  return {
    art: "direkt",
    id: "c1",
    name: "Lina Khemiri",
    partner: null,
    online: true,
    privat: null,
    anzahl_mitglieder: 2,
    reise: null,
    nicht_gelesen: 0,
    stumm: false,
    angeheftet: false,
    letzte: null,
    aktivitaet: "2026-10-30T10:00:00Z",
    ...o,
  };
}

function zeige(route: string, liste: ChatListItem[]) {
  vi.mocked(chats.useChatListe).mockReturnValue({
    data: liste,
    isLoading: false,
    isError: false,
  } as never);
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/chats" element={<ChatsPage />} />
          <Route path="/chats/:kanal/:id" element={<ChatsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: { id: "ich" } as never, accessToken: "t", isAuthenticated: true });
  vi.mocked(chats.useChatDienste).mockReturnValue({
    data: { gif: false, uebersetzung: false },
  } as never);
  vi.mocked(chats.useGruppenMitglieder).mockReturnValue({
    data: [{ id: "ich", prenom: "Ich", nom: "Selbst", photo: null, ist_ersteller: true }],
  } as never);
  vi.mocked(chats.useChatEinstellung).mockReturnValue(mut());
  vi.mocked(chats.useGruppeGelesen).mockReturnValue(mut());
  vi.mocked(chats.useReagieren).mockReturnValue(mut());
  vi.mocked(chats.useAnheften).mockReturnValue(mut());
  vi.mocked(chats.useAbstimmen).mockReturnValue(mut());
  vi.mocked(chats.useUebersetzen).mockReturnValue(mut());
  vi.mocked(chats.useMitreisende).mockReturnValue({ data: [] } as never);
  vi.mocked(communaute.useMessagesGroupe).mockReturnValue(leer);
  vi.mocked(communaute.useMessagesPrives).mockReturnValue(leer);
  for (const h of [
    "useLikerMessageGroupe",
    "useLikerMessagePrive",
    "useSupprimerMessageGroupe",
    "useSupprimerMessagePrive",
    "useQuitterGroupe",
    "useSupprimerGroupe",
    "useInviterAuGroupe",
    "useCreerConversation",
    "useCreerGroupe",
    "useRejoindreGroupe",
  ] as const)
    (communaute[h] as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mut());
  vi.mocked(communaute.useGroupe).mockReturnValue({ data: undefined } as never);
  vi.mocked(communaute.useRechercherMembres).mockReturnValue({
    data: [],
    isSuccess: true,
  } as never);
  vi.mocked(communaute.useGroupes).mockReturnValue({
    data: { results: [] },
    isLoading: false,
  } as never);
  vi.mocked(socket.useChatSocket).mockReturnValue({
    statut: "ouvert",
    messages: [],
    ereignisse: {
      geloescht: [],
      likes: [],
      reaktionen: [],
      pins: [],
      umfragen: [],
      gelesenVon: [],
    },
    tippende: [],
    erreur: null,
    envoyer: vi.fn(),
    tippSignal: vi.fn(),
    marquerLu: vi.fn(),
  } as never);
});

describe("ChatsPage", () => {
  it("zeigt die gemeinsame Liste und ohne Auswahl den Platzhalter", () => {
    zeige("/chats", [
      chat({}),
      chat({ id: "g1", art: "gruppe", name: "Berlin Fans", online: null }),
    ]);
    expect(screen.getByText("Lina Khemiri")).toBeInTheDocument();
    expect(screen.getByText("Berlin Fans")).toBeInTheDocument();
    expect(screen.getByText("chats.waehle_einen_chat")).toBeInTheDocument();
    expect(socket.useChatSocket).not.toHaveBeenCalled();
  });

  it("öffnet einen Direktchat über die Adresse und verbindet den passenden Kanal", () => {
    vi.mocked(communaute.useMessagesPrives).mockReturnValue({
      data: {
        results: [
          {
            id: "m1",
            expediteur: "u2",
            contenu: "Hallo Ghazi",
            est_expediteur: false,
            est_lu: false,
            created_at: "2026-10-30T09:00:00Z",
            nombre_likes: 0,
            jaime: false,
            repond_a: null,
            repond_a_detail: null,
            art: "text",
            daten: null,
            angeheftet: false,
            reaktionen: [],
          },
        ],
      },
      isLoading: false,
      isError: false,
    } as never);
    zeige("/chats/direkt/c1", [chat({})]);
    expect(socket.useChatSocket).toHaveBeenCalledWith("direkt", "c1");
    expect(screen.getByText("Hallo Ghazi")).toBeInTheDocument();
    expect(screen.queryByText("chats.waehle_einen_chat")).not.toBeInTheDocument();
  });

  it("Reisechat : Gruppenkanal, Reise-Leiste mit Link zum Reiseraum", () => {
    zeige("/chats/gruppe/g9", [
      chat({
        id: "g9",
        art: "reise",
        name: "Reise: Tunis",
        online: null,
        reise: { id: "r1", titel: "Tunis 2027" },
      }),
    ]);
    expect(socket.useChatSocket).toHaveBeenCalledWith("gruppe", "g9");
    const leiste = screen.getByTestId("reise-leiste");
    expect(leiste).toHaveTextContent("Tunis 2027");
    expect(leiste.querySelector("a")).toHaveAttribute("href", "/reisen/r1");
  });

  it("Gruppenchat : Systemzeile, angeheftete Leiste und Datumstrenner", () => {
    vi.mocked(communaute.useMessagesGroupe).mockReturnValue({
      data: {
        results: [
          {
            id: "s1",
            groupe: "g1",
            auteur: { id: "u2", prenom: "Lina", nom: "K", photo: null },
            contenu: "Lina hat die Gruppe erstellt",
            created_at: "2026-10-30T08:00:00Z",
            est_auteur: false,
            nombre_likes: 0,
            jaime: false,
            repond_a: null,
            repond_a_detail: null,
            art: "system",
            daten: null,
            angeheftet: false,
            reaktionen: [],
            umfrage: null,
          },
          {
            id: "m2",
            groupe: "g1",
            auteur: { id: "u2", prenom: "Lina", nom: "K", photo: null },
            contenu: "Treffen um 18 Uhr",
            created_at: "2026-10-30T09:00:00Z",
            est_auteur: false,
            nombre_likes: 0,
            jaime: false,
            repond_a: null,
            repond_a_detail: null,
            art: "text",
            daten: null,
            angeheftet: true,
            reaktionen: [],
            umfrage: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    } as never);
    zeige("/chats/gruppe/g1", [
      chat({ id: "g1", art: "gruppe", name: "Berlin", online: null, nicht_gelesen: 1 }),
    ]);
    expect(screen.getByTestId("system-zeile")).toBeInTheDocument();
    expect(screen.getByTestId("angeheftet-leiste")).toHaveTextContent("Treffen um 18 Uhr");
    expect(screen.getByTestId("ab-hier-neu")).toBeInTheDocument();
  });

  it("Info-Taste öffnet das Info-Fenster mit Stumm-Schalter", () => {
    zeige("/chats/direkt/c1", [chat({})]);
    fireEvent.click(screen.getByRole("button", { name: "chats.info" }));
    expect(screen.getByTestId("info-panel")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("schalter-stumm"));
    const einstellung = vi.mocked(chats.useChatEinstellung).mock.results[0].value;
    expect(einstellung.mutate).toHaveBeenCalledWith({ art: "direkt", id: "c1", stumm: true });
  });

  it("zeigt einen Hinweis, wenn der Chat nicht in der Liste steht", () => {
    zeige("/chats/direkt/unbekannt", [chat({})]);
    expect(screen.getByText("chats.nicht_gefunden")).toBeInTheDocument();
  });
});
