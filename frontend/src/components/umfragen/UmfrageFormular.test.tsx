import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { umfrage } from "../../test/umfrageFixture";
import UmfrageFormular from "./UmfrageFormular";

describe("UmfrageFormular", () => {
  it("baut Titel, Frist und Fragen zum Payload", () => {
    const speichern = vi.fn();
    render(
      <UmfrageFormular
        speichernLaeuft={false}
        fehler=""
        onSpeichern={speichern}
        onAbbrechen={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("admin.titel"), {
      target: { value: "Frage des Monats" },
    });
    fireEvent.change(screen.getByLabelText("admin.frage_text"), {
      target: { value: "Ja oder nein?" },
    });
    fireEvent.change(screen.getAllByLabelText("admin.option")[0], { target: { value: "Ja" } });
    fireEvent.change(screen.getAllByLabelText("admin.option")[1], { target: { value: "Nein" } });
    fireEvent.change(screen.getByLabelText("admin.frist"), {
      target: { value: "2099-05-01T18:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "admin.speichern" }));

    expect(speichern).toHaveBeenCalledTimes(1);
    const [payload] = speichern.mock.calls[0];
    expect(payload).toMatchObject({
      titel: "Frage des Monats",
      anonym: true,
      zielgruppe: "mitglieder",
      ergebnis_modus: "nach_frist",
    });
    expect(payload.fragen).toHaveLength(1);
    expect(payload.fragen[0].optionen).toEqual([{ text: "Ja" }, { text: "Nein" }]);
    expect(new Date(payload.frist).getFullYear()).toBe(2099);
  });

  it("sperrt Fragen, Zielgruppe und Anonymität nach der ersten Teilnahme", () => {
    render(
      <UmfrageFormular
        umfrage={umfrage({ anzahl_teilnahmen: 2 })}
        speichernLaeuft={false}
        fehler=""
        onSpeichern={vi.fn()}
        onAbbrechen={vi.fn()}
      />,
    );
    expect(screen.getByText("admin.gesperrt")).toBeInTheDocument();
    expect(screen.queryByText("admin.fragen")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });

  it("übernimmt Thema und Kommentarfeld in den Payload und behält Optionen-IDs", () => {
    const speichern = vi.fn();
    render(
      <UmfrageFormular
        umfrage={umfrage()}
        speichernLaeuft={false}
        fehler=""
        onSpeichern={speichern}
        onAbbrechen={vi.fn()}
      />,
    );
    fireEvent.change(screen.getAllByLabelText("admin.thema")[0], { target: { value: "Termin" } });
    fireEvent.click(screen.getAllByLabelText("admin.freitext_zusatz")[0]);
    fireEvent.click(screen.getByRole("button", { name: "admin.speichern" }));

    const [payload] = speichern.mock.calls[0];
    expect(payload.fragen[0]).toMatchObject({ id: "f1", thema: "Termin", freitext_zusatz: true });
    expect(payload.fragen[0].optionen[0]).toEqual({ id: "o1", text: "Samstag" });
    // Freitextfragen haben kein zusätzliches Kommentarfeld.
    expect(screen.getAllByLabelText("admin.freitext_zusatz")).toHaveLength(1);
  });
});
