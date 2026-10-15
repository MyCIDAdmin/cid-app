import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as rbac from "../../hooks/useRbac";
import { renderWithProviders } from "../../test/renderWithProviders";
import SupportPage from "./SupportPage";

vi.mock("../../hooks/useRbac", () => ({ usePageAccess: vi.fn() }));
vi.mock("../../components/support/FaqBereich", () => ({
  default: () => <div>faq-bereich</div>,
}));
vi.mock("../../components/support/MeineTickets", () => ({
  default: () => <div>meine-tickets</div>,
}));
vi.mock("../../components/support/BueroTickets", () => ({
  default: () => <div>buero-tickets</div>,
}));
vi.mock("../../components/support/FaqVerwaltung", () => ({
  default: () => <div>faq-verwaltung</div>,
}));
vi.mock("../../components/support/TicketAnsicht", () => ({
  default: ({ id, buero }: { id: number; buero: boolean }) => (
    <div>{`ticket-${id}-${buero ? "buero" : "person"}`}</div>
  ),
}));

function zugriff(modifiable: boolean) {
  vi.mocked(rbac.usePageAccess).mockReturnValue({
    accessible: modifiable,
    modifiable,
    isLoading: false,
  });
}

describe("SupportPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("zeigt Mitgliedern nur Hilfe und eigene Tickets", () => {
    zugriff(false);
    renderWithProviders(<SupportPage />, { route: "/support", path: "/support" });
    expect(screen.getByText("faq-bereich")).toBeInTheDocument();
    expect(screen.queryByText("tab.buero")).not.toBeInTheDocument();
    expect(screen.queryByText("tab.faq")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("tab.tickets"));
    expect(screen.getByText("meine-tickets")).toBeInTheDocument();
  });

  it("zeigt dem Büro alle Tickets und die Fragenpflege", () => {
    zugriff(true);
    renderWithProviders(<SupportPage />, { route: "/support", path: "/support" });
    fireEvent.click(screen.getByText("tab.buero"));
    expect(screen.getByText("buero-tickets")).toBeInTheDocument();
    fireEvent.click(screen.getByText("tab.faq"));
    expect(screen.getByText("faq-verwaltung")).toBeInTheDocument();
  });

  it("öffnet ein Ticket aus dem Link der Benachrichtigung", () => {
    zugriff(true);
    renderWithProviders(<SupportPage />, { route: "/support?ticket=12", path: "/support" });
    expect(screen.getByText("ticket-12-buero")).toBeInTheDocument();
  });

  it("ignoriert eine ungültige Ticketnummer", () => {
    zugriff(false);
    renderWithProviders(<SupportPage />, { route: "/support?ticket=abc", path: "/support" });
    expect(screen.getByText("faq-bereich")).toBeInTheDocument();
  });
});
