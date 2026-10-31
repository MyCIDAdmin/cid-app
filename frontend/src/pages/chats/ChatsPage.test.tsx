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
    useBearbeiten: vi.fn(),
    useChatAdmin: vi.fn(),
    useChatPause: vi.fn(),
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
    nur_erwaehnung: false,
    ich_admin: false,
    pausiert: false,
    pause_bis: null,
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
    data: [
      {
        id: "ich",
        prenom: "Ich",
        nom: "Selbst",
        photo: null,
        ist_ersteller: true,
        ist_admin: true,
      },
    ],
  } as never);
  vi.mocked(chats.useChatEinstellung).mockReturnValue(mut());
  vi.mocked(chats.useGruppeGelesen).mockReturnValue(mut());
  vi.mocked(chats.useReagieren).mockReturnValue(mut());
  vi.mocked(chats.useAnheften).mockReturnValue(mut());
  vi.mocked(chats.useAbstimmen).mockReturnValue(mut());
  vi.mocked(chats.useUebersetzen).mockReturnValue(mut());
  vi.mocked(chats.useMitreisende).mockReturnValue({ data: [] } as never);
  vi.mocked(chats.useBearbeiten).mockReturnValue(mut());
  vi.mocked(chats.useChatAdmin).mockReturnValue(mut());
  vi.mocked(chats.useChatPause).mockReturnValue(mut());
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
      bearbeitet: [],
      pause: null,
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

  it("Pause: Mitglieder sehen das Banner und können nicht schreiben", () => {
    zeige("/chats/gruppe/g1", [
      chat({ id: "g1", art: "gruppe", name: "Berlin", online: null, pausiert: true }),
    ]);
    expect(screen.getByTestId("pause-banner")).toHaveTextContent("chats.pause_aktiv");
    expect(screen.getByPlaceholderText("chats.pause_platzhalter")).toBeDisabled();
  });

  it("Pause: Chat-Admins dürfen weiter schreiben", () => {
    zeige("/chats/gruppe/g1", [
      chat({
        id: "g1",
        art: "gruppe",
        name: "Berlin",
        online: null,
        pausiert: true,
        ich_admin: true,
      }),
    ]);
    expect(screen.getByTestId("pause-banner")).toBeInTheDocument();
    expect(screen.getByLabelText("chats.nachricht_schreiben")).not.toBeDisabled();
  });

  it("Pause: ein Ereignis aus dem Kanal hebt die Pause auf", () => {
    vi.mocked(socket.useChatSocket).mockReturnValue({
      statut: "ouvert",
      messages: [],
      ereignisse: {
        geloescht: [],
        likes: [],
        reaktionen: [],
        pins: [],
        umfragen: [],
        bearbeitet: [],
        pause: { pausiert: false, bis: null },
        gelesenVon: [],
      },
      tippende: [],
      erreur: null,
      envoyer: vi.fn(),
      tippSignal: vi.fn(),
      marquerLu: vi.fn(),
    } as never);
    zeige("/chats/gruppe/g1", [
      chat({ id: "g1", art: "gruppe", name: "Berlin", online: null, pausiert: true }),
    ]);
    expect(screen.queryByTestId("pause-banner")).not.toBeInTheDocument();
  });

  it("Pause mit abgelaufenem Ende gilt nicht mehr", () => {
    zeige("/chats/gruppe/g1", [
      chat({
        id: "g1",
        art: "gruppe",
        name: "Berlin",
        online: null,
        pausiert: true,
        pause_bis: "2020-01-01T10:00:00Z",
      }),
    ]);
    expect(screen.queryByTestId("pause-banner")).not.toBeInTheDocument();
  });

  it("Info-Fenster Gruppe: Schalter „Nur bei @Erwähnung“ speichert die Einstellung", () => {
    zeige("/chats/gruppe/g1", [chat({ id: "g1", art: "gruppe", name: "Berlin", online: null })]);
    fireEvent.click(screen.getByRole("button", { name: "chats.info" }));
    fireEvent.click(screen.getByTestId("schalter-erwaehnung"));
    const einstellung = vi.mocked(chats.useChatEinstellung).mock.results[0].value;
    expect(einstellung.mutate).toHaveBeenCalledWith({
      art: "gruppe",
      id: "g1",
      nur_erwaehnung: true,
    });
  });

  it("Info-Fenster Direktchat hat keinen @Erwähnung-Schalter und keine Admin-Bereiche", () => {
    zeige("/chats/direkt/c1", [chat({})]);
    fireEvent.click(screen.getByRole("button", { name: "chats.info" }));
    expect(screen.queryByTestId("schalter-erwaehnung")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pause-bereich")).not.toBeInTheDocument();
  });

  it("Info-Fenster: Admins sehen Pause-Steuerung und können Admins ernennen", () => {
    vi.mocked(chats.useGruppenMitglieder).mockReturnValue({
      data: [
        { id: "ich", prenom: "Ich", nom: "S", photo: null, ist_ersteller: true, ist_admin: true },
        { id: "u2", prenom: "Anna", nom: "B", photo: null, ist_ersteller: false, ist_admin: false },
        { id: "u3", prenom: "Ben", nom: "C", photo: null, ist_ersteller: false, ist_admin: true },
      ],
    } as never);
    const admin = mut();
    const pause = mut();
    vi.mocked(chats.useChatAdmin).mockReturnValue(admin);
    vi.mocked(chats.useChatPause).mockReturnValue(pause);
    zeige("/chats/gruppe/g1", [
      chat({ id: "g1", art: "gruppe", name: "Berlin", online: null, ich_admin: true }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "chats.info" }));
    expect(screen.getByTestId("admin-marke")).toBeInTheDocument(); // Ben
    fireEvent.click(screen.getByTestId("admin-umschalten-u2"));
    expect((admin as unknown as { mutate: ReturnType<typeof vi.fn> }).mutate).toHaveBeenCalledWith({
      membreId: "u2",
      aktiv: true,
    });
    fireEvent.click(screen.getByTestId("admin-umschalten-u3"));
    expect(
      (admin as unknown as { mutate: ReturnType<typeof vi.fn> }).mutate,
    ).toHaveBeenLastCalledWith({ membreId: "u3", aktiv: false });
    expect(screen.queryByTestId("admin-umschalten-ich")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("chats.pause_dauer"), { target: { value: "1" } });
    fireEvent.click(screen.getByTestId("pause-umschalten"));
    const arg = (pause as unknown as { mutate: ReturnType<typeof vi.fn> }).mutate.mock.calls[0][0];
    expect(arg.aktiv).toBe(true);
    expect(typeof arg.bis).toBe("string");
  });

  it("Info-Fenster: Admin beendet eine laufende Pause", () => {
    const pause = mut();
    vi.mocked(chats.useChatPause).mockReturnValue(pause);
    zeige("/chats/gruppe/g1", [
      chat({
        id: "g1",
        art: "gruppe",
        name: "Berlin",
        online: null,
        ich_admin: true,
        pausiert: true,
      }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "chats.info" }));
    fireEvent.click(screen.getByTestId("pause-umschalten"));
    expect((pause as unknown as { mutate: ReturnType<typeof vi.fn> }).mutate).toHaveBeenCalledWith({
      aktiv: false,
    });
  });

  it("Info-Fenster: Mitglieder ohne Admin-Recht sehen weder Pause noch „Personen hinzufügen“", () => {
    zeige("/chats/gruppe/g1", [chat({ id: "g1", art: "gruppe", name: "Berlin", online: null })]);
    fireEvent.click(screen.getByRole("button", { name: "chats.info" }));
    expect(screen.queryByTestId("pause-bereich")).not.toBeInTheDocument();
    expect(screen.queryByText("chats.personen_hinzufuegen")).not.toBeInTheDocument();
  });

  it("zeigt einen Hinweis, wenn der Chat nicht in der Liste steht", () => {
    zeige("/chats/direkt/unbekannt", [chat({})]);
    expect(screen.getByText("chats.nicht_gefunden")).toBeInTheDocument();
  });
});
