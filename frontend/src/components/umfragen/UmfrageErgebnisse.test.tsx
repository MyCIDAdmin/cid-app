import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../../api/umfragen";
import * as hooks from "../../hooks/useUmfragen";
import * as download from "../../utils/telechargement";
import UmfrageErgebnisse from "./UmfrageErgebnisse";

vi.mock("../../api/umfragen", () => ({ umfrageBericht: vi.fn() }));
vi.mock("../../hooks/useUmfragen", () => ({ useUmfrageErgebnisse: vi.fn() }));
vi.mock("../../utils/telechargement", () => ({ declencherTelechargement: vi.fn() }));

function zeige() {
  vi.mocked(hooks.useUmfrageErgebnisse).mockReturnValue({
    data: {
      teilnehmende: 2,
      anonym: true,
      fragen: [
        {
          id: "f1",
          text: "Welcher Tag?",
          thema: "Termin",
          typ: "einzel",
          beantwortet: 2,
          optionen: [{ id: "o1", text: "Samstag", anzahl: 2, anteil: 100 }],
          freitexte: ["Gern früher"],
        },
      ],
    },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof hooks.useUmfrageErgebnisse>);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <UmfrageErgebnisse umfrageId="u1" />
    </QueryClientProvider>,
  );
}

describe("UmfrageErgebnisse", () => {
  beforeEach(() => vi.clearAllMocks());

  it("zeigt Thema, Balken und Bemerkungen", () => {
    zeige();
    expect(screen.getByRole("heading", { name: "Termin" })).toBeInTheDocument();
    expect(screen.getByText("Samstag")).toBeInTheDocument();
    expect(screen.getByText("ergebnisse.kommentare")).toBeInTheDocument();
    expect(screen.getByText("Gern früher")).toBeInTheDocument();
  });

  it("lädt den PDF-Bericht herunter", async () => {
    const blob = new Blob(["%PDF"]);
    vi.mocked(api.umfrageBericht).mockResolvedValue(blob);
    zeige();
    fireEvent.click(screen.getByRole("button", { name: "ergebnisse.pdf" }));
    await waitFor(() => expect(download.declencherTelechargement).toHaveBeenCalledTimes(1));
    expect(api.umfrageBericht).toHaveBeenCalledWith("u1");
    expect(vi.mocked(download.declencherTelechargement).mock.calls[0][0]).toBe(blob);
  });

  it("zeigt einen Fehler, wenn der Bericht scheitert", async () => {
    vi.mocked(api.umfrageBericht).mockRejectedValue(new Error("x"));
    zeige();
    fireEvent.click(screen.getByRole("button", { name: "ergebnisse.pdf" }));
    expect(await screen.findByText("ergebnisse.pdf_fehler")).toBeInTheDocument();
  });
});
