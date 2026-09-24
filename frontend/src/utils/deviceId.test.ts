import { beforeEach, describe, expect, it } from "vitest";

import { getDeviceId } from "./deviceId";

describe("getDeviceId", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("génère un identifiant et le persiste en localStorage", () => {
    const id = getDeviceId();

    expect(id).toBeTruthy();
    expect(window.localStorage.getItem("cid-device-id")).toBe(id);
  });

  it("renvoie le même identifiant à chaque appel (stable pour cet appareil)", () => {
    const premier = getDeviceId();
    const second = getDeviceId();

    expect(second).toBe(premier);
  });
});
