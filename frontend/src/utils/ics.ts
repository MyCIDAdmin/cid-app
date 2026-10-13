/**
 * Einzelnen Kalendereintrag als iCalendar-Datei (.ics) bereitstellen, damit er in den privaten
 * Kalender (Apple, Google, Outlook …) übernommen werden kann. Rein clientseitig — es gibt bewusst
 * kein Kalender-Abo (Release 17).
 */
import type { KalenderEintrag, Wiederholung } from "../types/kalender";
import { declencherTelechargement } from "./telechargement";

const REGELN: Record<Exclude<Wiederholung, "keine">, string> = {
  woechentlich: "FREQ=WEEKLY",
  zweiwoechentlich: "FREQ=WEEKLY;INTERVAL=2",
  monatlich: "FREQ=MONTHLY",
};

type IcsQuelle = Pick<
  KalenderEintrag,
  | "id"
  | "titel"
  | "beschreibung"
  | "ort"
  | "link"
  | "beginn"
  | "ende"
  | "ganztaegig"
  | "wiederholung"
  | "termin_id"
  | "objekt_id"
> & { wiederholung_bis?: string | null };

const zwei = (n: number) => String(n).padStart(2, "0");

function datum(d: Date): string {
  return `${d.getFullYear()}${zwei(d.getMonth() + 1)}${zwei(d.getDate())}`;
}

function utc(d: Date): string {
  return (
    `${d.getUTCFullYear()}${zwei(d.getUTCMonth() + 1)}${zwei(d.getUTCDate())}` +
    `T${zwei(d.getUTCHours())}${zwei(d.getUTCMinutes())}${zwei(d.getUTCSeconds())}Z`
  );
}

export function icsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Zeilen auf höchstens 75 Oktette kürzen (Fortsetzung mit Leerzeichen), ohne Zeichen zu teilen. */
export function falteZeile(zeile: string): string {
  const kodierer = new TextEncoder();
  if (kodierer.encode(zeile).length <= 75) return zeile;
  const teile: string[] = [];
  let aktuell = "";
  let laenge = 0;
  let grenze = 75;
  for (const zeichen of zeile) {
    const l = kodierer.encode(zeichen).length;
    if (laenge + l > grenze) {
      teile.push(aktuell);
      aktuell = "";
      laenge = 0;
      grenze = 74; // führendes Leerzeichen der Fortsetzungszeile
    }
    aktuell += zeichen;
    laenge += l;
  }
  teile.push(aktuell);
  return teile.join("\r\n ");
}

export function baueIcs(e: IcsQuelle, jetzt: Date = new Date()): string {
  const start = new Date(e.beginn);
  const ende = e.ende ? new Date(e.ende) : null;
  const zeilen = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CID//Kalender//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.termin_id ?? e.objekt_id ?? e.id}@my-cid.de`,
    `DTSTAMP:${utc(jetzt)}`,
  ];
  if (e.ganztaegig) {
    // DTEND ist bei ganztägigen Terminen exklusiv.
    const letzterTag = ende && ende > start ? ende : start;
    const bis = new Date(letzterTag.getFullYear(), letzterTag.getMonth(), letzterTag.getDate() + 1);
    zeilen.push(`DTSTART;VALUE=DATE:${datum(start)}`, `DTEND;VALUE=DATE:${datum(bis)}`);
  } else {
    const bis = ende ?? new Date(start.getTime() + 60 * 60 * 1000);
    zeilen.push(`DTSTART:${utc(start)}`, `DTEND:${utc(bis)}`);
  }
  zeilen.push(`SUMMARY:${icsText(e.titel)}`);
  const beschreibung = [e.beschreibung, e.link].filter(Boolean).join("\n\n");
  if (beschreibung) zeilen.push(`DESCRIPTION:${icsText(beschreibung)}`);
  if (e.ort) zeilen.push(`LOCATION:${icsText(e.ort)}`);
  if (/^https?:\/\//i.test(e.link)) zeilen.push(`URL:${e.link}`);
  if (e.wiederholung !== "keine") {
    let regel = REGELN[e.wiederholung];
    if (e.wiederholung_bis) {
      const [j, m, t] = e.wiederholung_bis.split("-").map(Number);
      regel += e.ganztaegig
        ? `;UNTIL=${j}${zwei(m)}${zwei(t)}`
        : `;UNTIL=${utc(new Date(j, m - 1, t, 23, 59, 59))}`;
    }
    zeilen.push(`RRULE:${regel}`);
  }
  zeilen.push("END:VEVENT", "END:VCALENDAR");
  return zeilen.map(falteZeile).join("\r\n") + "\r\n";
}

export function icsDateiname(titel: string): string {
  const name = titel
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${name || "termin"}.ics`;
}

export function ladeIcsHerunter(e: IcsQuelle): void {
  const blob = new Blob([baueIcs(e)], { type: "text/calendar;charset=utf-8" });
  declencherTelechargement(blob, icsDateiname(e.titel));
}
