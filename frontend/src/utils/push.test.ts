import { afterEach, describe, expect, it, vi } from "vitest";

import { alsAboDaten, istIos, pushLage, urlBase64ToUint8Array } from "./push";

function setUserAgent(ua: string, touch = 0) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);
  Object.defineProperty(navigator, "maxTouchPoints", { value: touch, configurable: true });
}

const ANDROID =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Version/17 Mobile Safari";

describe("urlBase64ToUint8Array", () => {
  it("wandelt base64url ohne Polster in Bytes", () => {
    // "hello?>" -> aGVsbG8_Pg (url-sicher, ohne "=")
    expect(Array.from(urlBase64ToUint8Array("aGVsbG8_Pg"))).toEqual([
      104, 101, 108, 108, 111, 63, 62,
    ]);
  });
});

describe("pushLage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function unterstuetzt(permission: NotificationPermission = "default") {
    vi.stubGlobal("PushManager", class {});
    vi.stubGlobal("Notification", { permission });
    Object.defineProperty(navigator, "serviceWorker", { value: {}, configurable: true });
  }

  it("iPhone im Safari-Tab: App muss erst installiert werden", () => {
    setUserAgent(IPHONE);
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    expect(istIos()).toBe(true);
    expect(pushLage()).toBe("ios_installieren");
  });

  it("iPhone als installierte App: weiter mit den normalen Prüfungen", () => {
    setUserAgent(IPHONE);
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    unterstuetzt();
    expect(pushLage()).toBe("bereit");
  });

  it("Android ohne Push-Unterstützung", () => {
    setUserAgent(ANDROID);
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    delete (window as unknown as Record<string, unknown>).PushManager;
    expect(pushLage()).toBe("nicht_unterstuetzt");
  });

  it("Android mit gesperrter Erlaubnis", () => {
    setUserAgent(ANDROID);
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    unterstuetzt("denied");
    expect(pushLage()).toBe("abgelehnt");
  });

  it("Android bereit", () => {
    setUserAgent(ANDROID);
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    unterstuetzt();
    expect(pushLage()).toBe("bereit");
  });
});

describe("alsAboDaten", () => {
  it("übernimmt Adresse und beide Schlüssel", () => {
    const sub = {
      endpoint: "https://fcm.googleapis.com/x",
      toJSON: () => ({ keys: { p256dh: "pp", auth: "aa" } }),
    } as unknown as PushSubscription;
    expect(alsAboDaten(sub)).toEqual({
      endpoint: "https://fcm.googleapis.com/x",
      keys: { p256dh: "pp", auth: "aa" },
    });
  });
});
