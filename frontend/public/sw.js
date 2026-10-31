/*
 * Service Worker der CID-App — nur für Push-Benachrichtigungen.
 *
 * Er zeigt eingehende Meldungen an und öffnet beim Tippen die passende Seite der App.
 * Er speichert nichts zwischen (kein Offline-Cache, kein fetch-Handler), damit nie ein alter Stand
 * der App hängen bleibt. Er wird erst registriert, wenn jemand Push im Profil einschaltet.
 * Die Meldung enthält nur Titel und Link, nie den Inhalt.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/** Nur Pfade innerhalb der App sind erlaubt ("/chats/…"), nie fremde Adressen. */
function sicherePfad(link) {
  if (typeof link !== "string") return "/";
  if (!link.startsWith("/") || link.startsWith("//") || link.includes("\\")) return "/";
  return link;
}

self.addEventListener("push", (event) => {
  let daten = {};
  try {
    daten = event.data ? event.data.json() : {};
  } catch {
    daten = {};
  }
  const titel = typeof daten.titel === "string" && daten.titel ? daten.titel : "";
  const fr = daten.sprache === "fr";
  const optionen = {
    body: titel || (fr ? "Nouvelle notification" : "Neue Benachrichtigung"),
    icon: "/favicon-192x192.png",
    badge: "/favicon-48x48.png",
    tag: typeof daten.tag === "string" ? daten.tag : undefined,
    data: { link: sicherePfad(daten.link) },
  };
  event.waitUntil(self.registration.showNotification("Clubistes in Deutschland", optionen));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const pfad = sicherePfad(event.notification.data && event.notification.data.link);
  const ziel = new URL(pfad, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const fenster = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const f of fenster) {
        if (new URL(f.url).origin === self.location.origin) {
          try {
            await f.focus();
            if ("navigate" in f) await f.navigate(ziel);
            return;
          } catch {
            // Fenster nicht mehr nutzbar: neues öffnen.
          }
        }
      }
      await self.clients.openWindow(ziel);
    })(),
  );
});
