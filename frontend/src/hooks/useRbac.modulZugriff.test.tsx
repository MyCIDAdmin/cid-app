import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { describe, expect, it } from "vitest";

import { useModulZugriff } from "./useRbac";

function wrapperMit(daten: Record<string, string>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["rbac", "mes-acces"], daten);
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useModulZugriff", () => {
  it("Lesen = sehen, aber nicht mitmachen", () => {
    const { result } = renderHook(() => useModulZugriff("projets"), {
      wrapper: wrapperMit({ projets: "lecture" }),
    });
    expect(result.current.sehen).toBe(true);
    expect(result.current.mitmachen).toBe(false);
  });

  it("Lesen & Schreiben = sehen und mitmachen", () => {
    const { result } = renderHook(() => useModulZugriff("projets"), {
      wrapper: wrapperMit({ projets: "lecture_ecriture" }),
    });
    expect(result.current.sehen).toBe(true);
    expect(result.current.mitmachen).toBe(true);
  });

  it("kein Eintrag oder Kein Zugriff = weder sehen noch mitmachen", () => {
    const { result } = renderHook(() => useModulZugriff("vote"), {
      wrapper: wrapperMit({ vote: "aucun" }),
    });
    expect(result.current.sehen).toBe(false);
    expect(result.current.mitmachen).toBe(false);
  });
});
