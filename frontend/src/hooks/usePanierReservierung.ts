/**
 * Hält die Warenkorb-Reservierung (2026-10-20) mit dem Server synchron — einmal im App-Layout
 * eingehängt, nicht pro Seite.
 *
 * - Jede inhaltliche Änderung am Warenkorb (Artikel hinzufügen, Menge ändern, entfernen) sendet
 *   den kompletten Warenkorb an den Server und startet den Countdown neu. Reines Neuladen der
 *   Seite startet ihn NICHT neu: beim Start wird nur der Stand abgefragt.
 * - Reserviert der Server weniger als gewünscht (anderer war schneller), wird die Menge im
 *   Warenkorb auf das Reservierbare begrenzt.
 * - Ein leerer Warenkorb gibt die Reservierung frei.
 * - Gutscheine haben keinen Lagerbestand und werden nicht gesendet.
 * - Läuft die Reservierung ab, darf sie nur `maxErneuerungen`-mal (zentral, Standard 2) erneuert
 *   werden („Erneut reservieren“ oder Änderung am Warenkorb nach Ablauf). Läuft sie danach noch
 *   einmal ab, wird der Warenkorb geleert (Wunsch 2026-10-20).
 */
import { useEffect, useRef } from "react";

import * as boutiqueApi from "../api/boutique";
import { usePanierStore } from "../store/panierStore";
import { useAuthStore } from "../store/authStore";

const VERZOEGERUNG_MS = 400;
const ABLAUF_PUFFER_MS = 300;

/** Ist die Reservierung abgelaufen und sind alle Erneuerungen verbraucht, wird der Warenkorb
 * geleert. Liefert true, wenn geleert wurde. */
function leereWennErneuerungenVerbraucht(): boolean {
  const state = usePanierStore.getState();
  const hatArtikel = state.articles.some((a) => a.typeProduit !== "bon_achat" && a.quantite > 0);
  const ende = state.reservierungEndeMs;
  if (!hatArtikel || ende === null || ende > Date.now()) return false;
  if (state.erneuerungen < state.maxErneuerungen) return false;
  state.leereWegenAblauf();
  return true;
}

function signatur(articles: { varianteId: string; quantite: number; typeProduit?: string }[]) {
  return articles
    .filter((a) => a.typeProduit !== "bon_achat" && a.quantite > 0)
    .map((a) => `${a.varianteId}:${a.quantite}`)
    .sort()
    .join("|");
}

export function usePanierReservierung(): void {
  const istAngemeldet = useAuthStore((s) => s.isAuthenticated);
  const hatMitglied = useAuthStore((s) => !!s.user);
  const articles = usePanierStore((s) => s.articles);
  const zuletztGesendet = useRef<string | null>(null);
  const reservierungEndeMs = usePanierStore((s) => s.reservierungEndeMs);

  // Beim Start nur den Stand lesen (kein Neustart des Countdowns).
  useEffect(() => {
    if (!istAngemeldet || !hatMitglied) return;
    zuletztGesendet.current = signatur(usePanierStore.getState().articles);
    const vorher = usePanierStore.getState().reservierungEndeMs;
    boutiqueApi
      .getPanierReservierung()
      .then((antwort) => {
        const state = usePanierStore.getState();
        if (typeof antwort.max_erneuerungen === "number") {
          state.setMaxErneuerungen(antwort.max_erneuerungen);
        }
        if (antwort.expire_le) {
          state.setReservierungEnde(Date.now() + antwort.restzeit_sekunden * 1000);
          return;
        }
        // Server kennt keine aktive Reservierung mehr: war sie hier schon abgelaufen, bleibt
        // das Ende gemerkt, damit ein späteres „Erneut reservieren“ als Erneuerung zählt.
        const warAbgelaufen = vorher !== null && vorher <= Date.now();
        state.setReservierungEnde(warAbgelaufen ? vorher : null);
        leereWennErneuerungenVerbraucht();
      })
      .catch(() => undefined);
  }, [istAngemeldet, hatMitglied]);

  // Ablauf der Reservierung abwarten: Sind alle Erneuerungen verbraucht, Warenkorb leeren.
  useEffect(() => {
    if (reservierungEndeMs === null) return;
    const warte = Math.max(reservierungEndeMs - Date.now(), 0) + ABLAUF_PUFFER_MS;
    const timer = window.setTimeout(() => {
      leereWennErneuerungenVerbraucht();
    }, warte);
    return () => window.clearTimeout(timer);
  }, [reservierungEndeMs]);

  const aktuell = signatur(articles);
  useEffect(() => {
    if (!istAngemeldet || !hatMitglied) return;
    if (zuletztGesendet.current === null || aktuell === zuletztGesendet.current) return;

    const timer = window.setTimeout(() => {
      const store = usePanierStore.getState();
      const lignes = store.articles
        .filter((a) => a.typeProduit !== "bon_achat" && a.quantite > 0)
        .map((a) => ({ variante: a.varianteId, quantite: a.quantite }));
      zuletztGesendet.current = signatur(store.articles);

      // Änderung nach abgelaufener Reservierung = erneute Reservierung.
      if (store.reservierungEndeMs !== null && store.reservierungEndeMs <= Date.now()) {
        store.zaehleErneuerung();
      }

      if (lignes.length === 0) {
        store.setReservierungEnde(null);
        boutiqueApi.gibPanierFrei().catch(() => undefined);
        return;
      }
      boutiqueApi
        .reservierePanier(lignes)
        .then((antwort) => {
          const state = usePanierStore.getState();
          if (typeof antwort.max_erneuerungen === "number") {
            state.setMaxErneuerungen(antwort.max_erneuerungen);
          }
          state.setReservierungEnde(
            antwort.expire_le ? Date.now() + antwort.restzeit_sekunden * 1000 : null,
          );
          state.reservierungAnwenden(antwort.zeilen);
          // Mengen können durch die Begrenzung kleiner geworden sein — kein erneutes Senden nötig.
          zuletztGesendet.current = signatur(usePanierStore.getState().articles);
        })
        .catch(() => undefined);
    }, VERZOEGERUNG_MS);

    return () => window.clearTimeout(timer);
  }, [aktuell, istAngemeldet, hatMitglied]);
}
