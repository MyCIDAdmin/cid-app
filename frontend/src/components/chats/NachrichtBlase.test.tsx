import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import type { ChatNachricht } from "../../types/chats";
import NachrichtBlase from "./NachrichtBlase";

function nachricht(o: Partial<ChatNachricht> = {}): ChatNachricht {
  return {
    id: "m1",
    art: "text",
    text: "Hallo zusammen",
    daten: null,
    vonId: "u2",
    vonName: "Lina Khemiri",
    ich: false,
    zeit: "2026-10-30T10:15:00Z",
    likes: 0,
    jaime: false,
    reaktionen: [],
    angeheftet: false,
    antwort: null,
    umfrage: null,
    gelesen: false,
    ...o,
  };
}

function zeige(n: ChatNachricht, opts: { direkt?: boolean; uebersetzung?: boolean } = {}) {
  const aktionen = {
    onAntworten: vi.fn(),
    onLike: vi.fn(),
    onReagieren: vi.fn(),
    onAnheften: vi.fn(),
    onLoeschen: vi.fn(),
    onAbstimmen: vi.fn(),
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NachrichtBlase
        nachricht={n}
        direkt={opts.direkt ?? false}
        dienste={{ gif: true, uebersetzung: opts.uebersetzung ?? false }}
        {...aktionen}
      />
    </QueryClientProvider>,
  );
  return aktionen;
}

describe("NachrichtBlase", () => {
  it("zeigt Absender, Text und hebt @Erwähnungen hervor", () => {
    zeige(nachricht({ text: "Hallo @Lina, bis 18 Uhr" }));
    expect(screen.getByText("Lina Khemiri")).toBeInTheDocument();
    expect(screen.getByText("@Lina")).toHaveClass("font-semibold");
  });

  it("zeigt im Direktchat bei eigenen Nachrichten Lesehäkchen", () => {
    zeige(nachricht({ ich: true, gelesen: true }), { direkt: true });
    expect(screen.getByLabelText("chats.gelesen")).toBeInTheDocument();
  });

  it("stellt Systemzeilen zentriert und ohne Leiste dar", () => {
    zeige(nachricht({ art: "system", text: "Lina ist der Gruppe beigetreten" }));
    expect(screen.getByTestId("system-zeile")).toHaveTextContent("Lina ist der Gruppe beigetreten");
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  it("zeigt GIFs nur bei https-Adressen", () => {
    const gif = {
      url: "https://media.giphy.com/a.gif",
      vorschau: "https://media.giphy.com/a.gif",
      titel: "Tor",
    };
    zeige(nachricht({ art: "gif", text: "", daten: gif }));
    expect(screen.getByAltText("Tor")).toHaveAttribute("src", gif.url);
  });

  it("blendet ein GIF mit http-Adresse aus", () => {
    zeige(
      nachricht({
        art: "gif",
        text: "",
        daten: {
          url: "http://evil.example/a.gif",
          vorschau: "http://evil.example/a.gif",
          titel: "X",
        },
      }),
    );
    expect(screen.queryByAltText("X")).not.toBeInTheDocument();
  });

  it("Umfrage: zeigt Stimmen, markiert meine Wahl und stimmt per Klick ab", () => {
    const a = zeige(
      nachricht({
        art: "umfrage",
        text: "",
        daten: { frage: "Wann treffen wir uns?", optionen: ["17 Uhr", "18 Uhr"], frist: "" },
        umfrage: { zaehler: [1, 3], gesamt: 4, meine: 1, beendet: false },
      }),
    );
    expect(screen.getByText("Wann treffen wir uns?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /18 Uhr/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("3 · 75%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /17 Uhr/ }));
    expect(a.onAbstimmen).toHaveBeenCalledWith("m1", 0);
  });

  it("Umfrage: beendete Umfrage ist nicht mehr abstimmbar", () => {
    zeige(
      nachricht({
        art: "umfrage",
        text: "",
        daten: { frage: "F", optionen: ["Eins", "Zwei"], frist: "2026-10-01T10:00:00Z" },
        umfrage: { zaehler: [0, 0], gesamt: 0, meine: null, beendet: true },
      }),
    );
    expect(screen.getByRole("button", { name: /Eins/ })).toBeDisabled();
  });

  it("Treffpunkt: zeigt Ort, Zeit und einen Kartenlink nur bei https", () => {
    zeige(
      nachricht({
        art: "treffpunkt",
        text: "",
        daten: { ort: "Hauptbahnhof", zeit: "18:30", link: "https://maps.example/x" },
      }),
    );
    expect(screen.getByText("Hauptbahnhof")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "chats.karte_oeffnen" })).toHaveAttribute(
      "href",
      "https://maps.example/x",
    );
  });

  it("Leiste: Reaktion, Herz, Antworten, Anheften; Löschen nur bei eigenen Nachrichten", () => {
    const a = zeige(nachricht());
    fireEvent.click(screen.getAllByRole("button", { name: "chats.reagieren_mit" })[0]);
    expect(a.onReagieren).toHaveBeenCalledWith("m1", "👍");
    fireEvent.click(screen.getByRole("button", { name: "chats.liken" }));
    expect(a.onLike).toHaveBeenCalledWith("m1");
    fireEvent.click(screen.getByRole("button", { name: "chats.antworten" }));
    expect(a.onAntworten).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "chats.anheften" }));
    expect(a.onAnheften).toHaveBeenCalledWith("m1");
    expect(screen.queryByRole("button", { name: "chats.loeschen" })).not.toBeInTheDocument();
  });

  it("Eigene Nachricht lässt sich löschen", () => {
    const a = zeige(nachricht({ ich: true }));
    fireEvent.click(screen.getByRole("button", { name: "chats.loeschen" }));
    expect(a.onLoeschen).toHaveBeenCalledWith("m1");
  });

  it("Reaktions-Kapsel schaltet die eigene Reaktion um", () => {
    const a = zeige(nachricht({ reaktionen: [{ emoji: "🔥", anzahl: 2, ich: true }] }));
    const kapsel = screen.getByRole("button", { name: "chats.reaktion_aria" });
    expect(kapsel).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(kapsel);
    expect(a.onReagieren).toHaveBeenCalledWith("m1", "🔥");
  });

  it("Übersetzen-Taste nur, wenn der Dienst aktiv ist", () => {
    zeige(nachricht(), { uebersetzung: false });
    expect(screen.queryByRole("button", { name: "chats.uebersetzen" })).not.toBeInTheDocument();
  });

  it("Übersetzen-Taste erscheint bei aktivem Dienst", () => {
    zeige(nachricht(), { uebersetzung: true });
    expect(screen.getByRole("button", { name: "chats.uebersetzen" })).toBeInTheDocument();
  });
});
