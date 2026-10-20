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
 */
import { useEffect, useRef } from "react";

import * as boutiqueApi from "../api/boutique";
import { usePanierStore } from "../store/panierStore";
import { useAuthStore } from "../store/authStore";

const VERZOEGERUNG_MS = 400;

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

  // Beim Start nur den Stand lesen (kein Neustart des Countdowns).
  useEffect(() => {
    if (!istAngemeldet || !hatMitglied) return;
    zuletztGesendet.current = signatur(usePanierStore.getState().articles);
    boutiqueApi
      .getPanierReservierung()
      .then((antwort) => {
        usePanierStore
          .getState()
          .setReservierungEnde(
            antwort.expire_le ? Date.now() + antwort.restzeit_sekunden * 1000 : null,
          );
      })
      .catch(() => undefined);
  }, [istAngemeldet, hatMitglied]);

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

      if (lignes.length === 0) {
        store.setReservierungEnde(null);
        boutiqueApi.gibPanierFrei().catch(() => undefined);
        return;
      }
      boutiqueApi
        .reservierePanier(lignes)
        .then((antwort) => {
          const state = usePanierStore.getState();
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
