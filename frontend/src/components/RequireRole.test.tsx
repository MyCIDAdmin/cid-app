import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../test/renderWithProviders";
import { useAuthStore } from "../store/authStore";
import RequireRole from "./RequireRole";

function setUser(role: "membre" | "rh" | null) {
  useAuthStore.setState({
    user: role
      ? { id: "u1", email: "u@example.com", role, langue_preferee: "fr" }
      : null,
  });
}

describe("RequireRole", () => {
  it("redirige quand le rôle est insuffisant", () => {
    setUser("membre");
    renderWithProviders(
      <RequireRole minRoleLevel={2}>
        <div>contenu protégé</div>
      </RequireRole>,
    );
    expect(screen.queryByText("contenu protégé")).not.toBeInTheDocument();
    expect(screen.getByTestId("route-fallback")).toBeInTheDocument();
  });

  it("rend les enfants quand le rôle est suffisant", () => {
    setUser("rh");
    renderWithProviders(
      <RequireRole minRoleLevel={2}>
        <div>contenu protégé</div>
      </RequireRole>,
    );
    expect(screen.getByText("contenu protégé")).toBeInTheDocument();
  });
});
