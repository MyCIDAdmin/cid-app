/** Hilfen für die Karte „Am Reiseziel“ : Wettercodes, Ortszeit und Zeitunterschied. */
import type { WetterArt } from "../types/reisen";

/** WMO-Wettercode (Open-Meteo) auf eine von sieben Darstellungen abbilden. */
export function wetterArt(code: number | null | undefined): WetterArt {
  if (code === null || code === undefined) return "wolken";
  if (code <= 1) return "sonne";
  if (code === 2) return "teilweise";
  if (code === 3) return "wolken";
  if (code === 45 || code === 48) return "nebel";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "regen";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "schnee";
  if (code >= 95) return "gewitter";
  return "wolken";
}

export const HEIMAT_ZONE = "Europe/Berlin";

/** Uhrzeit in einer Zeitzone. Gibt null zurück, wenn die Zone unbekannt ist. */
export function ortszeit(
  zone: string,
  jetzt: Date,
): { stunde: number; minute: number; text: string } | null {
  try {
    const teile = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(jetzt);
    const stunde = Number(teile.find((x) => x.type === "hour")?.value);
    const minute = Number(teile.find((x) => x.type === "minute")?.value);
    if (Number.isNaN(stunde) || Number.isNaN(minute)) return null;
    const zwei = (n: number) => String(n).padStart(2, "0");
    return { stunde, minute, text: `${zwei(stunde)}:${zwei(minute)}` };
  } catch {
    return null;
  }
}

function versatzMinuten(zone: string, jetzt: Date): number | null {
  try {
    const name = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "longOffset",
    })
      .formatToParts(jetzt)
      .find((x) => x.type === "timeZoneName")?.value;
    if (!name) return null;
    if (name === "GMT") return 0;
    const treffer = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
    if (!treffer) return null;
    const minuten = Number(treffer[2]) * 60 + Number(treffer[3]);
    return treffer[1] === "-" ? -minuten : minuten;
  } catch {
    return null;
  }
}

/** Stunden, die das Ziel gegenüber Berlin vorgeht (negativ: geht nach). Null, wenn unbekannt. */
export function zeitUnterschied(zone: string, jetzt: Date): number | null {
  const ziel = versatzMinuten(zone, jetzt);
  const heimat = versatzMinuten(HEIMAT_ZONE, jetzt);
  if (ziel === null || heimat === null) return null;
  return (ziel - heimat) / 60;
}
