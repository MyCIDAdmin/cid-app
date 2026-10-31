import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    bearbeitetAm: null,
    bearbeitetVonAdmin: false,
    ...o,
  };
}

function zeige(
  n: ChatNachricht,
  opts: { direkt?: boolean; uebersetzung?: boolean; istAdmin?: boolean } = {},
) {
  const aktionen = {
    onAntworten: vi.fn(),
    onLike: vi.fn(),
    onReagieren: vi.fn(),
    onAnheften: vi.fn(),
    onLoeschen: vi.fn(),
    onBearbeiten: vi.fn().mockResolvedValue(true),
    onAbstimmen: vi.fn(),
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NachrichtBlase
        nachricht={n}
        direkt={opts.direkt ?? false}
        istAdmin={opts.istAdmin}
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

  it("Eigener Text lässt sich bearbeiten und speichern", async () => {
    const a = zeige(nachricht({ ich: true, text: "Falsch" }));
    fireEvent.click(screen.getByRole("button", { name: "chats.bearbeiten" }));
    const feld = screen.getByRole("textbox", { name: "chats.bearbeiten" });
    fireEvent.change(feld, { target: { value: "Richtig" } });
    fireEvent.click(screen.getByRole("button", { name: "chats.speichern" }));
    await waitFor(() => expect(a.onBearbeiten).toHaveBeenCalledWith("m1", "Richtig"));
    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: "chats.bearbeiten" })).not.toBeInTheDocument(),
    );
  });

  it("Bearbeiten: Fehler bleibt im Feld sichtbar", async () => {
    const a = zeige(nachricht({ ich: true, text: "Falsch" }));
    a.onBearbeiten.mockResolvedValue(false);
    fireEvent.click(screen.getByRole("button", { name: "chats.bearbeiten" }));
    fireEvent.change(screen.getByRole("textbox", { name: "chats.bearbeiten" }), {
      target: { value: "Neu" },
    });
    fireEvent.click(screen.getByRole("button", { name: "chats.speichern" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("chats.bearbeiten_fehler");
  });

  it("Fremde Nachricht: nur Chat-Admins in Gruppen dürfen bearbeiten und löschen", () => {
    zeige(nachricht({ text: "Quatsch" }));
    expect(screen.queryByRole("button", { name: "chats.bearbeiten" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "chats.loeschen" })).not.toBeInTheDocument();
  });

  it("Chat-Admin darf fremde Gruppennachrichten bearbeiten und löschen", () => {
    const a = zeige(nachricht({ text: "Quatsch" }), { istAdmin: true });
    expect(screen.getByRole("button", { name: "chats.bearbeiten" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "chats.loeschen" }));
    expect(a.onLoeschen).toHaveBeenCalledWith("m1");
  });

  it("Im Direktchat hat der Admin-Status keine Wirkung auf fremde Nachrichten", () => {
    zeige(nachricht(), { direkt: true, istAdmin: true });
    expect(screen.queryByRole("button", { name: "chats.loeschen" })).not.toBeInTheDocument();
  });

  it("Zeigt die Marke „bearbeitet“, bei Admin-Änderung mit Hinweis", () => {
    zeige(nachricht({ bearbeitetAm: "2026-10-30T11:00:00Z" }));
    expect(screen.getByTestId("bearbeitet-marke")).toHaveTextContent("chats.bearbeitet");
    expect(screen.getByTestId("bearbeitet-marke")).not.toHaveTextContent("admin");
  });

  it("Zeigt „bearbeitet vom Admin“", () => {
    zeige(nachricht({ bearbeitetAm: "2026-10-30T11:00:00Z", bearbeitetVonAdmin: true }));
    expect(screen.getByTestId("bearbeitet-marke")).toHaveTextContent("chats.bearbeitet_admin");
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
