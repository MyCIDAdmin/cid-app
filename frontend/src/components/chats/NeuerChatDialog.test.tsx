import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as communaute from "../../hooks/useCommunaute";
import * as chats from "../../hooks/useChats";
import { useAuthStore } from "../../store/authStore";
import NeuerChatDialog from "./NeuerChatDialog";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof communaute>("../../hooks/useCommunaute");
  return {
    ...actual,
    useRechercherMembres: vi.fn(),
    useCreerConversation: vi.fn(),
    useCreerGroupe: vi.fn(),
    useInviterAuGroupe: vi.fn(),
    useGroupes: vi.fn(),
    useRejoindreGroupe: vi.fn(),
  };
});
vi.mock("../../hooks/useChats", async () => {
  const actual = await vi.importActual<typeof chats>("../../hooks/useChats");
  return { ...actual, useMitreisende: vi.fn() };
});

const lina = { id: "u2", prenom: "Lina", nom: "Khemiri", photo: null };
const sami = { id: "u3", prenom: "Sami", nom: "Ben Ali", photo: null };
interface MutationMock {
  mutate: ReturnType<typeof vi.fn>;
  mutateAsync: ReturnType<typeof vi.fn>;
  isPending: boolean;
}
const mutation = (extra: Partial<MutationMock> = {}): MutationMock => ({
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
  ...extra,
});

let konversation: MutationMock;
let gruppe: MutationMock;
let einladen: MutationMock;
let beitreten: MutationMock;

beforeEach(() => {
  useAuthStore.setState({ user: { id: "ich" } as never, isAuthenticated: true });
  konversation = mutation({ mutateAsync: vi.fn().mockResolvedValue({ id: "conv-1" }) });
  gruppe = mutation({ mutateAsync: vi.fn().mockResolvedValue({ id: "grp-1" }) });
  einladen = mutation({ mutateAsync: vi.fn().mockResolvedValue({}) });
  beitreten = mutation();
  vi.mocked(communaute.useRechercherMembres).mockReturnValue({
    data: [lina, sami, { id: "ich", prenom: "Ich", nom: "Selbst", photo: null }],
    isSuccess: true,
  } as never);
  vi.mocked(communaute.useCreerConversation).mockReturnValue(konversation as never);
  vi.mocked(communaute.useCreerGroupe).mockReturnValue(gruppe as never);
  vi.mocked(communaute.useInviterAuGroupe).mockReturnValue(einladen as never);
  vi.mocked(communaute.useRejoindreGroupe).mockReturnValue(beitreten as never);
  vi.mocked(communaute.useGroupes).mockReturnValue({
    data: { results: [] },
    isSuccess: true,
    isLoading: false,
  } as never);
  vi.mocked(chats.useMitreisende).mockReturnValue({ data: [] } as never);
});

function zeige(start: "neu" | "entdecken" = "neu") {
  const onOeffne = vi.fn();
  render(<NeuerChatDialog start={start} onClose={vi.fn()} onOeffne={onOeffne} />);
  return onOeffne;
}

describe("NeuerChatDialog", () => {
  it("eine Person = Direktchat", async () => {
    const onOeffne = zeige();
    expect(screen.queryByText("Ich Selbst")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Lina Khemiri/ }));
    fireEvent.click(screen.getByRole("button", { name: "chats.chat_starten" }));
    await waitFor(() => expect(onOeffne).toHaveBeenCalledWith("direkt", "conv-1"));
    expect(konversation.mutateAsync).toHaveBeenCalledWith("u2");
  });

  it("mehrere Personen = private Gruppe mit Namen", async () => {
    const onOeffne = zeige();
    fireEvent.click(screen.getByRole("button", { name: /Lina Khemiri/ }));
    fireEvent.click(screen.getByRole("button", { name: /Sami Ben Ali/ }));
    const anlegen = screen.getByRole("button", { name: "chats.gruppe_anlegen" });
    expect(anlegen).toBeDisabled();
    fireEvent.change(screen.getByLabelText("chats.gruppenname"), {
      target: { value: "Stammtisch" },
    });
    fireEvent.click(anlegen);
    await waitFor(() => expect(onOeffne).toHaveBeenCalledWith("gruppe", "grp-1"));
    expect(gruppe.mutateAsync).toHaveBeenCalledWith({
      nom: "Stammtisch",
      description: "",
      type_groupe: "prive",
      membres_invites: ["u2", "u3"],
    });
    expect(einladen.mutateAsync).not.toHaveBeenCalled();
  });

  it("öffentliche Gruppe lädt die Personen nachträglich ein", async () => {
    zeige();
    fireEvent.click(screen.getByRole("button", { name: /Lina Khemiri/ }));
    fireEvent.click(screen.getByRole("button", { name: /Sami Ben Ali/ }));
    fireEvent.change(screen.getByLabelText("chats.gruppenname"), { target: { value: "Offen" } });
    fireEvent.click(screen.getByLabelText("chats.nur_eingeladene"));
    fireEvent.click(screen.getByRole("button", { name: "chats.gruppe_anlegen" }));
    await waitFor(() =>
      expect(einladen.mutateAsync).toHaveBeenCalledWith({ id: "grp-1", membres: ["u2", "u3"] }),
    );
    expect(gruppe.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ type_groupe: "public", membres_invites: undefined }),
    );
  });

  it("Schnellauswahl „Alle Mitreisenden“ übernimmt die ganze Reisegruppe", () => {
    vi.mocked(chats.useMitreisende).mockReturnValue({
      data: [{ id: "r1", titel: "Tunis", mitglieder: [lina, sami] }],
    } as never);
    zeige();
    fireEvent.click(screen.getByRole("button", { name: "chats.alle_mitreisenden" }));
    expect(screen.getByLabelText("chats.gruppenname")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "chats.entfernen_person" })).toHaveLength(2);
  });

  it("Entdecken : eigene Gruppe öffnen, fremde beitreten", () => {
    vi.mocked(communaute.useGroupes).mockReturnValue({
      data: {
        results: [
          { id: "g1", nom: "Meine", nombre_membres: 3, type_groupe: "public", est_membre: true },
          { id: "g2", nom: "Fremde", nombre_membres: 5, type_groupe: "public", est_membre: false },
        ],
      },
      isSuccess: true,
      isLoading: false,
    } as never);
    const onOeffne = zeige("entdecken");
    fireEvent.click(screen.getByRole("button", { name: "chats.oeffnen" }));
    expect(onOeffne).toHaveBeenCalledWith("gruppe", "g1");
    fireEvent.click(screen.getByRole("button", { name: "chats.beitreten" }));
    expect(beitreten.mutate).toHaveBeenCalledWith("g2", expect.anything());
  });
});
