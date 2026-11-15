import { afterEach, describe, expect, it, vi } from "vitest";

import { base64urlZuBytes, bytesZuBase64url, istAbbruch, passkeysUnterstuetzt } from "./webauthn";

describe("webauthn", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("wandelt base64url und Bytes verlustfrei um", () => {
    const original = new Uint8Array([0, 250, 251, 252, 253, 254, 255, 62, 63]);
    const text = bytesZuBase64url(original.buffer)!;
    expect(text).not.toMatch(/[+/=]/);
    expect(Array.from(new Uint8Array(base64urlZuBytes(text)))).toEqual(Array.from(original));
  });

  it("gibt null zurück, wenn keine Bytes vorhanden sind (userHandle)", () => {
    expect(bytesZuBase64url(null)).toBeNull();
  });

  it("erkennt Abbruch im Geräte-Dialog", () => {
    expect(istAbbruch(new DOMException("x", "NotAllowedError"))).toBe(true);
    expect(istAbbruch(new Error("x"))).toBe(false);
  });

  it("meldet fehlende Unterstützung", () => {
    vi.stubGlobal("PublicKeyCredential", undefined);
    expect(passkeysUnterstuetzt()).toBe(false);
  });
});
