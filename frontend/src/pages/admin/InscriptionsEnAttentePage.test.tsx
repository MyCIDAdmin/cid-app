import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useInscriptionsHooks from "../../hooks/useInscriptions";
import type { PendingRegistrationsPage } from "../../types/inscription";
import InscriptionsEnAttentePage from "./InscriptionsEnAttentePage";

vi.mock("../../hooks/useInscriptions", async () => {
  const actual =
    await vi.importActual<typeof useInscriptionsHooks>("../../hooks/useInscriptions");
  return {
    ...actual,
    usePendingRegistrations: vi.fn(),
    useApproveRegistration: vi.fn(),
    useRefuseRegistration: vi.fn(),
  };
});

const inscription = {
  id: "u1",
  email: "candidat@example.com",
  langue_preferee: "fr" as const,
  created_at: "2026-01-15T10:00:00Z",
};

const page: PendingRegistrationsPage = { next: null, previous: null, results: [inscription] };

function mockList(overrides: Partial<ReturnType<typeof useInscriptionsHooks.usePendingRegistrations>> = {}) {
  vi.mocked(useInscriptionsHooks.usePendingRegistrations).mockReturnValue({
    data: page,
    isLoading: false,
    isError: false,
    ...overrides,
  } as ReturnType<typeof useInscriptionsHooks.usePendingRegistrations>);
}

describe("InscriptionsEnAttentePage", () => {
  const approveMutate = vi.fn();
  const refuseMutate = vi.fn();

  beforeEach(() => {
    approveMutate.mockReset();
    refuseMutate.mockReset();
    vi.mocked(useInscriptionsHooks.useApproveRegistration).mockReturnValue({
      mutate: approveMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useInscriptionsHooks.useApproveRegistration>);
    vi.mocked(useInscriptionsHooks.useRefuseRegistration).mockReturnValue({
      mutate: refuseMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useInscriptionsHooks.useRefuseRegistration>);
  });

  it("affiche les inscriptions en attente", () => {
    mockList();
    renderWithProviders(<InscriptionsEnAttentePage />);

    expect(screen.getByText("candidat@example.com")).toBeInTheDocument();
  });

  it("affiche un message si aucune inscription n'est en attente", () => {
    mockList({ data: { next: null, previous: null, results: [] } });
    renderWithProviders(<InscriptionsEnAttentePage />);

    expect(screen.getByText("liste.aucune_inscription")).toBeInTheDocument();
  });

  it("accepte une inscription après confirmation", () => {
    mockList();
    approveMutate.mockImplementation((_id, { onSuccess }: { onSuccess: () => void }) =>
      onSuccess(),
    );

    renderWithProviders(<InscriptionsEnAttentePage />);

    fireEvent.click(screen.getByText("liste.accepter"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByText("action.confirmer"));

    expect(approveMutate).toHaveBeenCalledWith("u1", expect.anything());
    expect(screen.getByText("liste.accepte_message")).toBeInTheDocument();
  });

  it("refuse une inscription après confirmation", () => {
    mockList();
    refuseMutate.mockImplementation((_id, { onSuccess }: { onSuccess: () => void }) =>
      onSuccess(),
    );

    renderWithProviders(<InscriptionsEnAttentePage />);

    fireEvent.click(screen.getByText("liste.refuser"));
    fireEvent.click(screen.getByText("action.confirmer"));

    expect(refuseMutate).toHaveBeenCalledWith("u1", expect.anything());
  });

  it("affiche une erreur si l'action échoue", () => {
    mockList();
    approveMutate.mockImplementation((_id, { onError }: { onError: (e: unknown) => void }) =>
      onError(new Error("network")),
    );

    renderWithProviders(<InscriptionsEnAttentePage />);

    fireEvent.click(screen.getByText("liste.accepter"));
    fireEvent.click(screen.getByText("action.confirmer"));

    expect(screen.getByText("liste.erreur_action")).toBeInTheDocument();
  });
});
