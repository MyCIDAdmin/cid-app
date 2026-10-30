import { useEffect, useState } from "react";

import { restZeit, type RestZeit } from "../utils/uebersicht";

/** Läuft sekündlich und liefert die Restzeit bis zum Ziel (undefined = kein Ziel). */
export function useCountdown(ziel: string | undefined, takt = 1000): RestZeit | undefined {
  const [jetzt, setJetzt] = useState(() => Date.now());
  useEffect(() => {
    if (!ziel) return;
    const id = window.setInterval(() => setJetzt(Date.now()), takt);
    return () => window.clearInterval(id);
  }, [ziel, takt]);
  return ziel ? restZeit(ziel, jetzt) : undefined;
}
