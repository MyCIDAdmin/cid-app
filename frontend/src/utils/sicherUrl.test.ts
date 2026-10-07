import { afterEach, describe, expect, it, vi } from "vitest";

import { istInternerPfad, leiteZuZahlungWeiter, sicherUrl } from "./sicherUrl";

describe("sicherUrl", () => {
  it("lässt http(s) durch", () => {
    expect(sicherUrl("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(sicherUrl("http://example.com")).toBe("http://example.com");
  });

  it("blockt gefährliche und ungültige Ziele", () => {
    expect(sicherUrl("javascript:alert(1)")).toBeNull();
    expect(sicherUrl("data:text/html,<script>1</script>")).toBeNull();
    expect(sicherUrl("//evil.com")).toBeNull();
    expect(sicherUrl("/intern")).toBeNull();
    expect(sicherUrl("")).toBeNull();
    expect(sicherUrl(null)).toBeNull();
  });
});

describe("istInternerPfad", () => {
  it("akzeptiert nur einfache interne Pfade", () => {
    expect(istInternerPfad("/boutique?x=1")).toBe(true);
    expect(istInternerPfad("//evil.com")).toBe(false);
    expect(istInternerPfad("/\\evil.com")).toBe(false);
    expect(istInternerPfad("https://evil.com")).toBe(false);
    expect(istInternerPfad("")).toBe(false);
    expect(istInternerPfad("/\t/evil.com")).toBe(false);
  });
});

describe("leiteZuZahlungWeiter", () => {
  const original = window.location;
  afterEach(() => {
    Object.defineProperty(window, "location", { value: original, writable: true });
    vi.restoreAllMocks();
  });

  function mockLocation() {
    const loc = { href: "http://localhost/" };
    Object.defineProperty(window, "location", { value: loc, writable: true });
    return loc;
  }

  it("leitet auf https-Ziele weiter", () => {
    const loc = mockLocation();
    expect(leiteZuZahlungWeiter("https://checkout.stripe.com/c/pay/1")).toBe(true);
    expect(loc.href).toBe("https://checkout.stripe.com/c/pay/1");
  });

  it("verweigert javascript:, http und leere Ziele", () => {
    const loc = mockLocation();
    expect(leiteZuZahlungWeiter("javascript:alert(1)")).toBe(false);
    expect(leiteZuZahlungWeiter("http://evil.com")).toBe(false);
    expect(leiteZuZahlungWeiter("")).toBe(false);
    expect(loc.href).toBe("http://localhost/");
  });
});
