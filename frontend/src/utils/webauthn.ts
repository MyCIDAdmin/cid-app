/**
 * Passkeys (WebAuthn) im Browser : Optionen des Servers (base64url-JSON) in die Browser-API
 * übersetzen und das Ergebnis wieder als JSON zurückgeben. Bewusst ohne Zusatzbibliothek.
 * Die biometrischen Daten verlassen das Gerät nie ; der Server sieht nur den öffentlichen Schlüssel.
 */

export interface PasskeyOptionen {
  challenge: string;
  rp?: { id?: string; name: string };
  user?: { id: string; name: string; displayName: string };
  rpId?: string;
  timeout?: number;
  excludeCredentials?: { id: string; type: "public-key"; transports?: string[] }[];
  allowCredentials?: { id: string; type: "public-key"; transports?: string[] }[];
  [key: string]: unknown;
}

export function base64urlZuBytes(wert: string): ArrayBuffer {
  const base64 = wert.replace(/-/g, "+").replace(/_/g, "/");
  const gepolstert = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binaer = atob(gepolstert);
  const bytes = new Uint8Array(binaer.length);
  for (let i = 0; i < binaer.length; i += 1) bytes[i] = binaer.charCodeAt(i);
  return bytes.buffer;
}

export function bytesZuBase64url(puffer: ArrayBuffer | null): string | null {
  if (!puffer) return null;
  const bytes = new Uint8Array(puffer);
  let binaer = "";
  for (let i = 0; i < bytes.length; i += 1) binaer += String.fromCharCode(bytes[i]);
  return btoa(binaer).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function passkeysUnterstuetzt(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof navigator.credentials?.create === "function"
  );
}

/** Der Benutzer hat den Dialog des Geräts abgebrochen oder die Zeit ist abgelaufen. */
export function istAbbruch(fehler: unknown): boolean {
  return (
    fehler instanceof DOMException &&
    (fehler.name === "NotAllowedError" || fehler.name === "AbortError")
  );
}

function absteigerListe(liste: PasskeyOptionen["excludeCredentials"]) {
  return (liste ?? []).map((c) => ({
    ...c,
    id: base64urlZuBytes(c.id),
    transports: c.transports as AuthenticatorTransport[] | undefined,
  }));
}

export async function passkeyErstellen(
  optionen: PasskeyOptionen,
): Promise<Record<string, unknown>> {
  const erstellt = (await navigator.credentials.create({
    publicKey: {
      ...(optionen as unknown as PublicKeyCredentialCreationOptions),
      challenge: base64urlZuBytes(optionen.challenge),
      user: { ...optionen.user!, id: base64urlZuBytes(optionen.user!.id) },
      excludeCredentials: absteigerListe(optionen.excludeCredentials),
    },
  })) as PublicKeyCredential | null;
  if (!erstellt) throw new DOMException("Abgebrochen", "NotAllowedError");
  const antwort = erstellt.response as AuthenticatorAttestationResponse;
  return {
    id: erstellt.id,
    rawId: bytesZuBase64url(erstellt.rawId),
    type: erstellt.type,
    response: {
      clientDataJSON: bytesZuBase64url(antwort.clientDataJSON),
      attestationObject: bytesZuBase64url(antwort.attestationObject),
      transports: antwort.getTransports?.() ?? [],
    },
  };
}

export async function passkeyAbfragen(optionen: PasskeyOptionen): Promise<Record<string, unknown>> {
  const erhalten = (await navigator.credentials.get({
    publicKey: {
      ...(optionen as unknown as PublicKeyCredentialRequestOptions),
      challenge: base64urlZuBytes(optionen.challenge),
      allowCredentials: absteigerListe(optionen.allowCredentials),
    },
  })) as PublicKeyCredential | null;
  if (!erhalten) throw new DOMException("Abgebrochen", "NotAllowedError");
  const antwort = erhalten.response as AuthenticatorAssertionResponse;
  return {
    id: erhalten.id,
    rawId: bytesZuBase64url(erhalten.rawId),
    type: erhalten.type,
    response: {
      clientDataJSON: bytesZuBase64url(antwort.clientDataJSON),
      authenticatorData: bytesZuBase64url(antwort.authenticatorData),
      signature: bytesZuBase64url(antwort.signature),
      userHandle: bytesZuBase64url(antwort.userHandle),
    },
  };
}
