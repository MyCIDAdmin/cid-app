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
});
