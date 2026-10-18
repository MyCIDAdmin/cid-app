import { useEffect, useRef } from "react";

/**
 * Schließt Fenster und Popups mit der Escape-Taste (WCAG 2.1.2).
 *
 * Alle offenen Fenster stehen in einem gemeinsamen Stapel : Escape schließt immer nur das
 * oberste (zuletzt geöffnete) Fenster, nie mehrere auf einmal. Wer sich nur für die Dauer
 * einer Anzeige anmeldet, übergibt `aktiv = false`, solange das Fenster zu ist.
 */
type Schliesser = { aufrufen: () => void };

const stapel: Schliesser[] = [];

function beiTaste(e: KeyboardEvent) {
  if (e.key !== "Escape" || e.defaultPrevented || stapel.length === 0) return;
  e.preventDefault();
  stapel[stapel.length - 1].aufrufen();
}

export function useEscapeSchliessen(onClose: () => void, aktiv = true): void {
  // Der Rückruf wechselt bei jedem Rendern ; die Stapelposition muss stabil bleiben.
  const neuester = useRef(onClose);
  useEffect(() => {
    neuester.current = onClose;
  });

  useEffect(() => {
    if (!aktiv) return;
    const eintrag: Schliesser = { aufrufen: () => neuester.current() };
    if (stapel.length === 0) document.addEventListener("keydown", beiTaste);
    stapel.push(eintrag);
    return () => {
      const i = stapel.indexOf(eintrag);
      if (i >= 0) stapel.splice(i, 1);
      if (stapel.length === 0) document.removeEventListener("keydown", beiTaste);
    };
  }, [aktiv]);
}

let mausdruckAufHintergrund = false;

/**
 * Klick auf den abgedunkelten Hintergrund schließt das Fenster. Gilt nur, wenn Drücken und
 * Loslassen beide auf dem Hintergrund selbst stattfinden : Wer im Fenster Text markiert und
 * außerhalb loslässt, soll nichts verlieren.
 */
export function hintergrundKlick(onClose: () => void) {
  return {
    onMouseDown: (e: { target: EventTarget; currentTarget: EventTarget }) => {
      mausdruckAufHintergrund = e.target === e.currentTarget;
    },
    onClick: (e: { target: EventTarget; currentTarget: EventTarget }) => {
      const ok = mausdruckAufHintergrund && e.target === e.currentTarget;
      mausdruckAufHintergrund = false;
      if (ok) onClose();
    },
  };
}
