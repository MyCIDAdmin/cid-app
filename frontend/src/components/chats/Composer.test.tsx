import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import type { Auteur } from "../../types/communaute";
import Composer from "./Composer";

const lina: Auteur = { id: "u2", prenom: "Lina", nom: "Khemiri", photo: null };

function zeige(o: Partial<React.ComponentProps<typeof Composer>> = {}) {
  const props = {
    verbunden: true,
    gruppe: true,
    dienste: { gif: false, uebersetzung: false },
    mitglieder: [lina],
    antwort: null,
    fehler: null,
    onAntwortAbbrechen: vi.fn(),
    onSenden: vi.fn(),
    onTippt: vi.fn(),
    ...o,
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Composer {...props} />
    </QueryClientProvider>,
  );
  return props;
}

const feld = () => screen.getByLabelText("chats.nachricht_schreiben");

describe("Composer", () => {
  it("sendet Text mit Enter-Formular und leert das Feld", () => {
    const p = zeige();
    fireEvent.change(feld(), { target: { value: "Bis gleich!" } });
    expect(p.onTippt).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "chats.senden" }));
    expect(p.onSenden).toHaveBeenCalledWith({
      contenu: "Bis gleich!",
      art: "text",
      daten: null,
      repondA: undefined,
    });
    expect(feld()).toHaveValue("");
  });

  it("sendet nichts bei leerem Text oder ohne Verbindung", () => {
    const p = zeige({ verbunden: false });
    expect(feld()).toBeDisabled();
    expect(screen.getByRole("button", { name: "chats.senden" })).toBeDisabled();
    expect(p.onSenden).not.toHaveBeenCalled();
  });

  it("GIF-Taste nur bei aktivem Dienst", () => {
    zeige();
    expect(screen.queryByRole("button", { name: "chats.gif" })).not.toBeInTheDocument();
  });

  it("GIF-Taste erscheint bei aktivem Dienst", () => {
    zeige({ dienste: { gif: true, uebersetzung: false } });
    expect(screen.getByRole("button", { name: "chats.gif" })).toBeInTheDocument();
  });

  it("Anhang-Menü : Umfrage nur in Gruppen, Treffpunkt überall", () => {
    zeige({ gruppe: false });
    fireEvent.click(screen.getByRole("button", { name: "chats.anhang" }));
    expect(screen.getByRole("menuitem", { name: "chats.treffpunkt" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "chats.umfrage" })).not.toBeInTheDocument();
  });

  it("Umfrage erstellen und senden", () => {
    const p = zeige();
    fireEvent.click(screen.getByRole("button", { name: "chats.anhang" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "chats.umfrage" }));
    fireEvent.change(screen.getByLabelText("chats.umfrage_frage"), { target: { value: "Wann?" } });
    const antworten = screen.getAllByLabelText("chats.umfrage_antwort");
    fireEvent.change(antworten[0], { target: { value: "17 Uhr" } });
    fireEvent.change(antworten[1], { target: { value: "18 Uhr" } });
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "chats.senden" }),
    );
    expect(p.onSenden).toHaveBeenCalledWith(
      expect.objectContaining({
        art: "umfrage",
        daten: { frage: "Wann?", optionen: ["17 Uhr", "18 Uhr"], frist: "" },
      }),
    );
  });

  it("Treffpunkt mit unsicherem Link wird nicht gesendet", () => {
    const p = zeige();
    fireEvent.click(screen.getByRole("button", { name: "chats.anhang" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "chats.treffpunkt" }));
    fireEvent.change(screen.getByLabelText("chats.treffpunkt_ort"), {
      target: { value: "Bahnhof" },
    });
    fireEvent.change(screen.getByLabelText("chats.treffpunkt_link"), {
      target: { value: "http://x.example" },
    });
    expect(screen.getByText("chats.treffpunkt_link_fehler")).toBeInTheDocument();
    expect(
      within(screen.getByRole("dialog")).getByRole("button", { name: "chats.senden" }),
    ).toBeDisabled();
    expect(p.onSenden).not.toHaveBeenCalled();
  });

  it("schlägt bei @ Mitglieder der Gruppe vor und setzt den Vornamen ein", () => {
    zeige();
    fireEvent.change(feld(), { target: { value: "Hallo @Li" } });
    fireEvent.click(screen.getByRole("option", { name: "Lina Khemiri" }));
    expect(feld()).toHaveValue("Hallo @Lina ");
  });

  it("Antwort-Leiste : zeigt den Bezug, schickt repondA mit und schließt sich", () => {
    const antwort = {
      id: "m9",
      art: "text",
      text: "Wann geht's los?",
      vonName: "Lina",
    } as unknown as React.ComponentProps<typeof Composer>["antwort"];
    const p = zeige({ antwort });
    expect(screen.getByText(/Wann geht's los\?/)).toBeInTheDocument();
    fireEvent.change(feld(), { target: { value: "Um 18 Uhr" } });
    fireEvent.click(screen.getByRole("button", { name: "chats.senden" }));
    expect(p.onSenden).toHaveBeenCalledWith(expect.objectContaining({ repondA: "m9" }));
    expect(p.onAntwortAbbrechen).toHaveBeenCalled();
  });
});
