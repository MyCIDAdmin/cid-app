import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useNotificationsHooks from "../../hooks/useNotifications";
import type { Notification } from "../../types/notification";
import NotificationBell from "./NotificationBell";

vi.mock("../../hooks/useNotifications", async () => {
  const actual = await vi.importActual<typeof useNotificationsHooks>(
    "../../hooks/useNotifications",
  );
  return {
    ...actual,
    useNonLuesCount: vi.fn(),
    useNotifications: vi.fn(),
    useMarquerLue: vi.fn(),
    useToutMarquerLu: vi.fn(),
  };
});

function notification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "n1",
    type_notification: "evenement_rappel",
    titre: "Déplacement Stuttgart",
    message: "Rappel : dans 3 jours",
    lien: "/evenements",
    lu: false,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("NotificationBell", () => {
  let marquerLueMock: ReturnType<typeof vi.fn>;
  let toutMarquerLuMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    marquerLueMock = vi.fn();
    toutMarquerLuMock = vi.fn();

    vi.mocked(useNotificationsHooks.useNonLuesCount).mockReturnValue({
      data: { count: 1 },
    } as unknown as ReturnType<typeof useNotificationsHooks.useNonLuesCount>);
    vi.mocked(useNotificationsHooks.useNotifications).mockReturnValue({
      data: { next: null, previous: null, results: [notification()] },
      isLoading: false,
    } as unknown as ReturnType<typeof useNotificationsHooks.useNotifications>);
    vi.mocked(useNotificationsHooks.useMarquerLue).mockReturnValue({
      mutate: marquerLueMock,
    } as unknown as ReturnType<typeof useNotificationsHooks.useMarquerLue>);
    vi.mocked(useNotificationsHooks.useToutMarquerLu).mockReturnValue({
      mutate: toutMarquerLuMock,
      isPending: false,
    } as unknown as ReturnType<typeof useNotificationsHooks.useToutMarquerLu>);
  });

  it("affiche le badge avec le nombre de notifications non lues", () => {
    renderWithProviders(<NotificationBell />);
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("ouvre le panneau et affiche les notifications au clic sur la cloche", () => {
    renderWithProviders(<NotificationBell />);
    fireEvent.click(screen.getByLabelText("cloche.aria_label"));
    expect(screen.getByText("Déplacement Stuttgart")).toBeInTheDocument();
  });

  it("marque une notification lue au clic dessus", () => {
    renderWithProviders(<NotificationBell />);
    fireEvent.click(screen.getByLabelText("cloche.aria_label"));
    fireEvent.click(screen.getByText("Déplacement Stuttgart"));
    expect(marquerLueMock).toHaveBeenCalledWith("n1");
  });

  it("tout marquer lu appelle la mutation dédiée", () => {
    renderWithProviders(<NotificationBell />);
    fireEvent.click(screen.getByLabelText("cloche.aria_label"));
    fireEvent.click(screen.getByText("cloche.tout_lire"));
    expect(toutMarquerLuMock).toHaveBeenCalled();
  });

  it("n'affiche pas de badge quand il n'y a aucune notification non lue", () => {
    vi.mocked(useNotificationsHooks.useNonLuesCount).mockReturnValue({
      data: { count: 0 },
    } as unknown as ReturnType<typeof useNotificationsHooks.useNonLuesCount>);
    renderWithProviders(<NotificationBell />);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});
