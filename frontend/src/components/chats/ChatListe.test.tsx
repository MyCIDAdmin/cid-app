import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ChatListItem } from "../../types/chats";
import ChatListe from "./ChatListe";

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
    letzte: {
      text: "Bis gleich",
      art: "text",
      ich: false,
      von: "Lina",
      zeit: "2026-10-01T10:00:00Z",
    },
    aktivitaet: "2026-10-01T10:00:00Z",
    ...o,
  };
}

function zeige(
  chats: ChatListItem[] | undefined,
  o: Partial<React.ComponentProps<typeof ChatListe>> = {},
) {
  const props = {
    chats,
    laedt: false,
    fehler: false,
    filter: "alle" as const,
    suche: "",
    onFilter: vi.fn(),
    onSuche: vi.fn(),
    onWaehle: vi.fn(),
    onNeu: vi.fn(),
    onEntdecken: vi.fn(),
    ...o,
  };
  render(<ChatListe {...props} />);
  return props;
}

describe("ChatListe", () => {
  it("zeigt Name, Vorschau, Ungelesen-Zähler und den Online-Punkt", () => {
    zeige([chat({ nicht_gelesen: 3 })]);
    expect(screen.getByText("Lina Khemiri")).toBeInTheDocument();
    expect(screen.getByText("Bis gleich")).toBeInTheDocument();
    expect(screen.getByLabelText("chats.ungelesen_aria")).toHaveTextContent("3");
    expect(screen.getByTestId("online-punkt")).toBeInTheDocument();
  });

  it("trennt Angeheftete und kennzeichnet Reise-, private und stumme Chats", () => {
    zeige([
      chat({ id: "1", name: "Fixiert", angeheftet: true }),
      chat({ id: "2", art: "reise", name: "Tunis 2027", online: null }),
      chat({ id: "3", art: "gruppe", name: "Berlin", privat: true, online: null, stumm: true }),
    ]);
    expect(screen.getByText("chats.angeheftet", { selector: "h2" })).toBeInTheDocument();
    expect(screen.getByText("chats.weitere", { selector: "h2" })).toBeInTheDocument();
    expect(screen.getByText("chats.marke_reise")).toBeInTheDocument();
    expect(screen.getByText("chats.marke_privat")).toBeInTheDocument();
    expect(screen.getByLabelText("chats.stumm")).toBeInTheDocument();
  });

  it("Vorschau: eigene Nachricht mit „Du“, Gruppen mit Absendername, GIF als Wort", () => {
    zeige([
      chat({
        id: "1",
        letzte: { text: "ok", art: "text", ich: true, von: "Ich", zeit: "2026-10-01T10:00:00Z" },
      }),
      chat({
        id: "2",
        art: "gruppe",
        name: "Gruppe",
        online: null,
        letzte: { text: "", art: "gif", ich: false, von: "Sami", zeit: "2026-10-01T10:00:00Z" },
      }),
    ]);
    expect(screen.getByText(/chats\.du: ok/)).toBeInTheDocument();
    expect(screen.getByText(/Sami: chats\.vorschau_gif/)).toBeInTheDocument();
  });

  it("wählt einen Chat, filtert, sucht und öffnet Dialoge", () => {
    const p = zeige([chat({})]);
    fireEvent.click(screen.getByTestId("chat-c1"));
    expect(p.onWaehle).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }));
    fireEvent.click(screen.getByRole("button", { name: "chats.filter_gruppen" }));
    expect(p.onFilter).toHaveBeenCalledWith("gruppen");
    fireEvent.change(screen.getByLabelText("chats.suche"), { target: { value: "Li" } });
    expect(p.onSuche).toHaveBeenCalledWith("Li");
    fireEvent.click(screen.getByRole("button", { name: "chats.neuer_chat" }));
    expect(p.onNeu).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "chats.gruppen_entdecken" }));
    expect(p.onEntdecken).toHaveBeenCalled();
  });

  it("Leerzustände und Fehler", () => {
    zeige([]);
    expect(screen.getByText("chats.keine_chats")).toBeInTheDocument();
  });

  it("zeigt „nichts gefunden“ bei aktiver Suche", () => {
    zeige([chat({})], { suche: "xyz" });
    expect(screen.getByText("chats.nichts_gefunden")).toBeInTheDocument();
  });

  it("zeigt den Ladefehler", () => {
    zeige(undefined, { fehler: true });
    expect(screen.getByText("chats.fehler_laden")).toBeInTheDocument();
  });
});
