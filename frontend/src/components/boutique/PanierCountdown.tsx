/**
 * Countdown der Warenkorb-Reservierung (2026-10-20): „Dein Warenkorb ist noch mm:ss reserviert“.
 * Die Dauer legt der App-Administrator zentral fest (Standard 20 Minuten) ; der Server liefert nur
 * die Restzeit, hier wird sie heruntergezählt. Läuft sie ab, sind die Artikel serverseitig wieder
 * frei — „Erneut reservieren“ legt sie (soweit noch verfügbar) wieder zurück. Das geht nur
 * `maxErneuerungen`-mal (zentral, Standard 2); läuft sie danach noch einmal ab, wird der
 * Warenkorb geleert (siehe hooks/usePanierReservierung) und hier ein Hinweis gezeigt.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import * as boutiqueApi from "../../api/boutique";
import { usePanierStore } from "../../store/panierStore";

function formatiere(sekunden: number): string {
  const minuten = Math.floor(sekunden / 60);
  const rest = sekunden % 60;
  return `${String(minuten).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export default function PanierCountdown() {
  const { t } = useTranslation("boutique");
  const endeMs = usePanierStore((s) => s.reservierungEndeMs);
  const hatArtikel = usePanierStore((s) => s.articles.some((a) => a.typeProduit !== "bon_achat"));
  const erneuerungen = usePanierStore((s) => s.erneuerungen);
  const maxErneuerungen = usePanierStore((s) => s.maxErneuerungen);
  const geleert = usePanierStore((s) => s.geleertWegenAblauf);
  const [jetzt, setJetzt] = useState(() => Date.now());

  useEffect(() => {
    if (endeMs === null) return;
    const timer = window.setInterval(() => setJetzt(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [endeMs]);

  if (!hatArtikel) {
    if (!geleert) return null;
    return (
      <div
        role="status"
        className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-cid-lg bg-status-warningBg px-4 py-3 text-sm text-status-warningText"
      >
        <span>{t("panier.geleert_hinweis")}</span>
        <button
          type="button"
          onClick={() => usePanierStore.getState().quittiereGeleert()}
          className="rounded-cid bg-ca px-3 py-1.5 text-xs font-medium text-white hover:bg-cad"
        >
          {t("panier.hinweis_schliessen")}
        </button>
      </div>
    );
  }

  const rest = endeMs === null ? 0 : Math.max(Math.ceil((endeMs - jetzt) / 1000), 0);

  if (endeMs === null || rest === 0) {
    return (
      <div
        role="status"
        className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-cid-lg bg-status-warningBg px-4 py-3 text-sm text-status-warningText"
      >
        <span>
          {t("panier.reservierung_abgelaufen")}{" "}
          {t("panier.erneuerungen_rest", { n: Math.max(maxErneuerungen - erneuerungen, 0) })}
        </span>
        <button
          type="button"
          onClick={() => {
            const store = usePanierStore.getState();
            // Nur eine wirklich abgelaufene Reservierung zählt als Erneuerung.
            if (store.reservierungEndeMs !== null) store.zaehleErneuerung();
            const lignes = store.articles
              .filter((a) => a.typeProduit !== "bon_achat" && a.quantite > 0)
              .map((a) => ({ variante: a.varianteId, quantite: a.quantite }));
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
                setJetzt(Date.now());
              })
              .catch(() => undefined);
          }}
          className="rounded-cid bg-ca px-3 py-1.5 text-xs font-medium text-white hover:bg-cad"
        >
          {t("panier.erneut_reservieren")}
        </button>
      </div>
    );
  }

  const dringend = rest <= 120;
  return (
    <div
      role="timer"
      aria-live="off"
      aria-label={t("panier.reservierung_countdown_label")}
      className={`mb-4 flex items-center justify-between gap-3 rounded-cid-lg px-4 py-3 text-sm ${
        dringend
          ? "bg-status-dangerBg text-status-dangerText"
          : "bg-status-infoBg text-status-infoText"
      }`}
    >
      <span>{t("panier.reservierung_hinweis")}</span>
      <span className="text-lg font-bold tabular-nums">{formatiere(rest)}</span>
    </div>
  );
}
