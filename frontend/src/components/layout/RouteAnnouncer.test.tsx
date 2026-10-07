import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import RouteAnnouncer from "./RouteAnnouncer";

describe("RouteAnnouncer", () => {
  it("setzt den Seitentitel passend zur Route und kündigt ihn an", () => {
    renderWithProviders(<RouteAnnouncer />, { route: "/dashboard", path: "*" });
    expect(document.title).toMatch(/ — CID$/);
    expect(document.title).not.toBe("CID");
    expect(screen.getByRole("status")).toHaveTextContent(document.title);
  });

  it("fällt bei unbekannten Routen auf den Markennamen zurück", () => {
    renderWithProviders(<RouteAnnouncer />, { route: "/gibt-es-nicht", path: "*" });
    expect(document.title).toBe("CID");
  });
});
