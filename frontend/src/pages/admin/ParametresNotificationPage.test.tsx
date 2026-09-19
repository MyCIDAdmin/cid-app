import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useNotificationsHooks from "../../hooks/useNotifications";
import type { ParametresNotification } from "../../types/notification";
import ParametresNotificationPage from "./ParametresNotificationPage";

vi.mock("../../hooks/useNotifications", async () => {
  const actual = await vi.importActual<typeof useNotificationsHooks>("../../hooks/useNotifications");
  return {
    ...actual,
    useParametresNotification: vi.fn(),
    useModifierParametresNotification: vi.fn(),
  };
});

function parametres(overrides: Partial<ParametresNotification> = {}): ParametresNotification {
  return {
    email_membres: true,
    email_cotisations: true,
    email_adhesions: true,
    email_evenements: true,
    email_boutique: true,
    email_vote: true,
    email_communaute: true,
    modifie_par: null,
    updated_at: "2026-09-19T10:00:00Z",
    ...overrides,
  };
}

describe("ParametresNotificationPage", () => {
  let modifierMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    modifierMock = vi.fn();
    vi.mocked(useNotificationsHooks.useModifierParametresNotification).mockReturnValue({
      mutate: modifierMock,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useNotificationsHooks.useModifierParametresNotification>);
  });

  it("affiche un interrupteur activé pour chaque module", () => {
    vi.mocked(useNotificationsHooks.useParametresNotification).mockReturnValue({
      data: parametres(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useNotificationsHooks.useParametresNotification>);

    renderWithProviders(<ParametresNotificationPage />);

    const interrupteurs = screen.getAllByRole("switch");
    expect(interrupteurs).toHaveLength(7);
    interrupteurs.forEach((interrupteur) => {
      expect(interrupteur).toHaveAttribute("aria-checked", "true");
    });
  });

  it("reflète un module désactivé", () => {
    vi.mocked(useNotificationsHooks.useParametresNotification).mockReturnValue({
      data: parametres({ email_boutique: false }),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useNotificationsHooks.useParametresNotification>);

    renderWithProviders(<ParametresNotificationPage />);

    expect(screen.getByText("parametres.module.boutique")).toBeInTheDocument();
  });

  it("bascule un module au clic sur son interrupteur", () => {
    vi.mocked(useNotificationsHooks.useParametresNotification).mockReturnValue({
      data: parametres(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useNotificationsHooks.useParametresNotification>);

    renderWithProviders(<ParametresNotificationPage />);

    fireEvent.click(screen.getAllByRole("switch")[0]);

    expect(modifierMock).toHaveBeenCalledWith(expect.objectContaining({ email_membres: false }));
  });

  it("affiche un message de chargement", () => {
    vi.mocked(useNotificationsHooks.useParametresNotification).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useNotificationsHooks.useParametresNotification>);

    renderWithProviders(<ParametresNotificationPage />);

    expect(screen.getByText("parametres.chargement")).toBeInTheDocument();
  });
});
