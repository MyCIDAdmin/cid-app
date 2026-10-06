/**
 * Speichert die Anzeige-Präferenzen eines angemeldeten Benutzers (Sprache, Hell/Dunkel,
 * Seitenleiste) am Konto und wendet sie bei jeder neuen Anmeldung wieder an (Wunsch vom
 * 2026-10-07: "Die Präferenzen im Profil sollen gespeichert und bei neuer Anmeldung
 * berücksichtigt werden").
 *
 * - Anmeldung / Konto-Wechsel: hat das Konto bereits gespeicherte Präferenzen
 *   (`ui_praeferenzen` nicht leer), werden sie angewendet. Sonst (erste Anmeldung seit
 *   Einführung) werden die aktuellen lokalen Werte einmalig am Konto gespeichert — so
 *   überschreibt der Standardwert "fr" nicht die bisherige Browser-Sprache.
 * - Änderungen (i18n, uiStore) werden entprellt per PATCH /auth/me/ gespeichert.
 */
import { useEffect, useRef } from "react";
import i18n from "../i18n";

import { speicherePraeferenzen } from "../api/auth";
import { useAuthStore, type CidUser, type UiPraeferenzen } from "../store/authStore";
import { useUiStore } from "../store/uiStore";

type Sprache = "fr" | "de";

function aktuelleSprache(): Sprache {
  return i18n.language?.toLowerCase().startsWith("de") ? "de" : "fr";
}

function lokalePraeferenzen(): { langue_preferee: Sprache; ui_praeferenzen: UiPraeferenzen } {
  const { theme, sidebarCollapsed } = useUiStore.getState();
  return {
    langue_preferee: aktuelleSprache(),
    ui_praeferenzen: { theme, sidebar_collapsed: sidebarCollapsed },
  };
}

function hatGespeichertePraeferenzen(user: CidUser): boolean {
  return Object.keys(user.ui_praeferenzen ?? {}).length > 0;
}

function anwenden(user: CidUser): void {
  const prefs = user.ui_praeferenzen ?? {};
  if (user.langue_preferee === "fr" || user.langue_preferee === "de") {
    if (aktuelleSprache() !== user.langue_preferee) void i18n.changeLanguage(user.langue_preferee);
  }
  const ui = useUiStore.getState();
  if (prefs.theme && prefs.theme !== ui.theme) ui.setTheme(prefs.theme);
  if (
    typeof prefs.sidebar_collapsed === "boolean" &&
    prefs.sidebar_collapsed !== ui.sidebarCollapsed
  ) {
    ui.setSidebarCollapsed(prefs.sidebar_collapsed);
  }
}

function weichtAb(user: CidUser): boolean {
  const lokal = lokalePraeferenzen();
  const gespeichert = user.ui_praeferenzen ?? {};
  return (
    user.langue_preferee !== lokal.langue_preferee ||
    gespeichert.theme !== lokal.ui_praeferenzen.theme ||
    gespeichert.sidebar_collapsed !== lokal.ui_praeferenzen.sidebar_collapsed
  );
}

export default function usePraeferenzenSync(): void {
  const user = useAuthStore((s) => s.user);
  const angewendetFuer = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function speichern() {
    const aktuell = useAuthStore.getState().user;
    if (!aktuell || !weichtAb(aktuell)) return;
    try {
      const gespeichert = await speicherePraeferenzen(lokalePraeferenzen());
      useAuthStore.getState().setUser({ ...aktuell, ...gespeichert });
    } catch {
      // best effort — die lokale Einstellung bleibt wirksam, beim nächsten Wechsel erneut versucht
    }
  }

  function geplantSpeichern() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void speichern(), 600);
  }

  // Anmeldung / Konto-Wechsel
  useEffect(() => {
    if (!user) {
      angewendetFuer.current = null;
      return;
    }
    if (angewendetFuer.current === user.id) return;
    angewendetFuer.current = user.id;
    if (hatGespeichertePraeferenzen(user)) anwenden(user);
    else void speichern();
  }, [user]);

  // Änderungen speichern
  useEffect(() => {
    const unsubscribe = useUiStore.subscribe((state, prev) => {
      if (state.theme !== prev.theme || state.sidebarCollapsed !== prev.sidebarCollapsed) {
        geplantSpeichern();
      }
    });
    i18n.on("languageChanged", geplantSpeichern);
    return () => {
      unsubscribe();
      i18n.off("languageChanged", geplantSpeichern);
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
