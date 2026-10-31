/**
 * Hilfsfunktionen für Web-Push im Browser (Release 2026.11).
 * Alles hier ist rein browserseitig ; der Server kennt nur die fertige Anmeldung.
 */
import type { PushAboDaten } from "../api/push";

export type PushLage = "nicht_unterstuetzt" | "ios_installieren" | "abgelehnt" | "bereit";

/** Der öffentliche VAPID-Schlüssel kommt als base64url ; `subscribe` braucht Bytes. */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const polster = "=".repeat((4 - (base64.length % 4)) % 4);
  const roh = atob((base64 + polster).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(roh, (z) => z.charCodeAt(0));
}

export function istIos(): boolean {
  const ua = navigator.userAgent || "";
  // iPadOS meldet sich als Mac, hat aber Touch-Bedienung.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** Läuft die Seite als installierte App (Home-Bildschirm) ? */
export function istInstalliert(): boolean {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

export function pushUnterstuetzt(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Was kann dieses Gerät gerade ? Reihenfolge ist wichtig : iPhone im Safari-Tab hat kein PushManager. */
export function pushLage(): PushLage {
  if (istIos() && !istInstalliert()) return "ios_installieren";
  if (!pushUnterstuetzt()) return "nicht_unterstuetzt";
  if (Notification.permission === "denied") return "abgelehnt";
  return "bereit";
}

/** Bestehende Anmeldung dieses Geräts, ohne den Service Worker neu zu registrieren. */
export async function aktuelleAnmeldung(): Promise<PushSubscription | null> {
  if (!pushUnterstuetzt()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  return reg ? reg.pushManager.getSubscription() : null;
}

export function alsAboDaten(sub: PushSubscription): PushAboDaten {
  const json = sub.toJSON();
  return {
    endpoint: sub.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
  };
}

/**
 * Fragt die Erlaubnis ab, registriert den Service Worker und meldet das Gerät beim Push-Dienst
 * an. Wirft "permission", wenn die Erlaubnis nicht erteilt wurde.
 */
export async function anmeldungErzeugen(schluessel: string): Promise<PushSubscription> {
  const erlaubnis = await Notification.requestPermission();
  if (erlaubnis !== "granted") throw new Error("permission");
  await navigator.serviceWorker.register("/sw.js");
  const reg = await navigator.serviceWorker.ready;
  const optionen = {
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(schluessel) as BufferSource,
  };
  const vorhanden = await reg.pushManager.getSubscription();
  if (vorhanden) {
    if (gleicherSchluessel(vorhanden, optionen.applicationServerKey)) return vorhanden;
    // Anmeldung mit altem Schlüssel (z. B. nach einem Schlüsselwechsel) : löschen und neu anmelden.
    await vorhanden.unsubscribe();
  }
  return reg.pushManager.subscribe(optionen);
}

function gleicherSchluessel(sub: PushSubscription, schluessel: BufferSource): boolean {
  const alt = sub.options?.applicationServerKey;
  if (!alt) return true;
  const a = new Uint8Array(alt);
  const b = new Uint8Array(schluessel as ArrayBuffer);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
