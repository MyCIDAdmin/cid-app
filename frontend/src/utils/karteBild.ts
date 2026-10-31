/**
 * Mitgliedskarte als Bild speichern (Release 2026.11) : zeichnet Vorder- und Rückseite samt QR-Code
 * in ein PNG, das man im Handy ablegen und ohne Netz zeigen kann. Alles passiert im Browser, das
 * Bild verlässt das Gerät nicht. Farben und Verlauf stammen aus `kartendesign.ts` (wie die Anzeige).
 */
import { STILE, verlaufLinie, verlaufStopps } from "../components/adhesions/kartendesign";
import { kartenStilOderStandard } from "../components/adhesions/kartenstile";
import { symbolPfad } from "../components/adhesions/vorteile";
import type { AvantageOffre } from "../types/adhesion";

export interface KartenBildDaten {
  stil: string | null | undefined;
  angebot: string;
  name: string;
  mitgliedsnummer?: string;
  mitgliedSeit?: string;
  gueltigBis?: string;
  kampagne?: string;
  vorteile: AvantageOffre[];
  /** QR als data:-URL (Rückseite). */
  qr?: string;
  /** Beschriftungen in der Sprache der App. */
  texte: {
    titel: string;
    mitgliedSeit: string;
    gueltigBis: string;
    rueckseite: string;
    /** Fertiger Text „+ 3 weitere Vorteile“ je Anzahl. */
    mehr: (anzahl: number) => string;
  };
}

/** Breite einer Karte im Bild ; Höhe nach Kartenformat 1,586 : 1. */
const BREITE = 1080;
const HOEHE = Math.round(BREITE / 1.586);
const RAND = 48;
const MAX_VORTEILE = 5;
const SCHRIFT = "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/** Dateiname aus dem Namen : nur Buchstaben, Ziffern und Bindestriche. */
export function bildDateiname(name: string): string {
  const grundlage = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `mitgliedskarte${grundlage ? `-${grundlage}` : ""}.png`;
}

function laden(quelle: string): Promise<HTMLImageElement> {
  return new Promise((ok, fehler) => {
    const bild = new Image();
    bild.onload = () => ok(bild);
    bild.onerror = () => fehler(new Error(`Bild nicht ladbar: ${quelle.slice(0, 40)}`));
    bild.src = quelle;
  });
}

function rundesRechteck(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  b: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + b, y, x + b, y + h, r);
  ctx.arcTo(x + b, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + b, y, r);
  ctx.closePath();
}

function text(
  ctx: CanvasRenderingContext2D,
  inhalt: string,
  x: number,
  y: number,
  opts: {
    groesse: number;
    gewicht?: number;
    farbe: string;
    ausrichtung?: CanvasTextAlign;
    maxBreite?: number;
    mono?: boolean;
  },
) {
  ctx.font = `${opts.gewicht ?? 400} ${opts.groesse}px ${opts.mono ? "ui-monospace, Menlo, Consolas, monospace" : SCHRIFT}`;
  ctx.fillStyle = opts.farbe;
  ctx.textAlign = opts.ausrichtung ?? "left";
  ctx.textBaseline = "alphabetic";
  if (opts.maxBreite) ctx.fillText(inhalt, x, y, opts.maxBreite);
  else ctx.fillText(inhalt, x, y);
}

function kartenflaeche(ctx: CanvasRenderingContext2D, oy: number, stilKey: string) {
  const s = STILE[kartenStilOderStandard(stilKey)];
  const l = verlaufLinie(BREITE, HOEHE);
  const verlauf = ctx.createLinearGradient(l.x0, oy + l.y0, l.x1, oy + l.y1);
  for (const stopp of verlaufStopps(s.fond)) verlauf.addColorStop(stopp.position, stopp.farbe);
  rundesRechteck(ctx, 0, oy, BREITE, HOEHE, 44);
  ctx.fillStyle = verlauf;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = s.rahmen;
  ctx.stroke();
  return s;
}

function zeichneVorderseite(
  ctx: CanvasRenderingContext2D,
  oy: number,
  d: KartenBildDaten,
  logo: HTMLImageElement | null,
) {
  const s = kartenflaeche(ctx, oy, String(d.stil ?? ""));
  const links = RAND + 12;
  const rechts = BREITE - RAND - 12;

  // Logo auf weißer Kapsel
  const logoH = 56;
  const logoB = logo ? Math.round((logo.width / logo.height) * logoH) : 0;
  if (logo) {
    rundesRechteck(ctx, links, oy + RAND, logoB + 36, logoH + 20, (logoH + 20) / 2);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fill();
    ctx.drawImage(logo, links + 18, oy + RAND + 10, logoB, logoH);
  }
  text(ctx, d.texte.titel.toUpperCase(), rechts, oy + RAND + 40, {
    groesse: 24,
    gewicht: 600,
    farbe: s.gedaempft,
    ausrichtung: "right",
  });

  // Chip + Angebot + Kampagne
  const mitteY = oy + HOEHE / 2 + 10;
  rundesRechteck(ctx, links, mitteY - 34, 84, 62, 10);
  ctx.strokeStyle = s.text;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.globalAlpha = 1;
  text(ctx, d.angebot, links + 112, mitteY + 8, {
    groesse: 60,
    gewicht: 800,
    farbe: s.text,
    maxBreite: rechts - links - 112,
  });
  if (d.kampagne) {
    text(ctx, d.kampagne, links + 112, mitteY + 48, {
      groesse: 26,
      farbe: s.gedaempft,
      maxBreite: rechts - links - 112,
    });
  }

  // Name, Nummer, Daten
  const unten = oy + HOEHE - RAND - 12;
  text(ctx, d.name.toUpperCase(), links, unten - (d.mitgliedsnummer ? 38 : 0), {
    groesse: 38,
    gewicht: 600,
    farbe: s.text,
    maxBreite: (rechts - links) * 0.62,
  });
  if (d.mitgliedsnummer) {
    text(ctx, d.mitgliedsnummer, links, unten, {
      groesse: 28,
      farbe: s.gedaempft,
      mono: true,
    });
  }
  let y = unten - 36;
  if (d.gueltigBis) {
    text(ctx, d.gueltigBis, rechts, unten, {
      groesse: 28,
      gewicht: 600,
      farbe: s.text,
      ausrichtung: "right",
    });
    text(ctx, d.texte.gueltigBis.toUpperCase(), rechts, y, {
      groesse: 20,
      farbe: s.gedaempft,
      ausrichtung: "right",
    });
    y -= 78;
  }
  if (d.mitgliedSeit) {
    text(ctx, d.mitgliedSeit, rechts, y + 42, {
      groesse: 28,
      gewicht: 600,
      farbe: s.text,
      ausrichtung: "right",
    });
    text(ctx, d.texte.mitgliedSeit.toUpperCase(), rechts, y + 6, {
      groesse: 20,
      farbe: s.gedaempft,
      ausrichtung: "right",
    });
  }
}

function zeichneRueckseite(
  ctx: CanvasRenderingContext2D,
  oy: number,
  d: KartenBildDaten,
  qr: HTMLImageElement | null,
) {
  const s = kartenflaeche(ctx, oy, String(d.stil ?? ""));
  const links = RAND + 12;
  const rechts = BREITE - RAND - 12;

  text(ctx, d.angebot.toUpperCase(), links, oy + RAND + 36, {
    groesse: 34,
    gewicht: 800,
    farbe: s.text,
    maxBreite: (rechts - links) * 0.6,
  });
  text(ctx, d.texte.rueckseite.toUpperCase(), rechts, oy + RAND + 36, {
    groesse: 22,
    gewicht: 600,
    farbe: s.gedaempft,
    ausrichtung: "right",
  });

  const qrGroesse = 260;
  const listeBreite = qr ? rechts - links - qrGroesse - 40 : rechts - links;
  let y = oy + RAND + 120;
  for (const v of d.vorteile.slice(0, MAX_VORTEILE)) {
    ctx.save();
    ctx.translate(links, y - 26);
    ctx.scale(1.7, 1.7);
    ctx.strokeStyle = s.text;
    ctx.lineWidth = 1.8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke(new Path2D(symbolPfad(v.icone)));
    ctx.restore();
    text(ctx, v.texte_fr, links + 62, y, {
      groesse: 32,
      farbe: s.text,
      maxBreite: listeBreite - 62,
    });
    y += 54;
  }
  if (d.vorteile.length > MAX_VORTEILE) {
    text(ctx, d.texte.mehr(d.vorteile.length - MAX_VORTEILE), links, y, {
      groesse: 26,
      farbe: s.gedaempft,
    });
  }

  if (qr) {
    const qx = rechts - qrGroesse;
    const qy = oy + HOEHE - RAND - 12 - qrGroesse;
    rundesRechteck(ctx, qx - 14, qy - 14, qrGroesse + 28, qrGroesse + 28, 22);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.imageSmoothingEnabled = false; // QR-Module scharf halten
    ctx.drawImage(qr, qx, qy, qrGroesse, qrGroesse);
    ctx.imageSmoothingEnabled = true;
  }
  if (d.mitgliedsnummer) {
    text(ctx, d.mitgliedsnummer, links, oy + HOEHE - RAND - 12, {
      groesse: 28,
      farbe: s.gedaempft,
      mono: true,
    });
  }
}

/** Zeichnet beide Kartenseiten untereinander (weißer Grund) und liefert das PNG. */
export async function erzeugeKartenBild(d: KartenBildDaten): Promise<Blob> {
  if (typeof document !== "undefined" && document.fonts?.ready) await document.fonts.ready;
  const [logo, qr] = await Promise.all([
    laden("/brand/logo-cid-couleur.png").catch(() => null),
    d.qr ? laden(d.qr).catch(() => null) : Promise.resolve(null),
  ]);

  const abstand = 56;
  const canvas = document.createElement("canvas");
  canvas.width = BREITE + 2 * abstand;
  canvas.height = 2 * HOEHE + 3 * abstand;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas nicht verfügbar");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(abstand, abstand);
  zeichneVorderseite(ctx, 0, d, logo);
  zeichneRueckseite(ctx, HOEHE + abstand, d, qr);
  ctx.restore();

  return new Promise((ok, fehler) =>
    canvas.toBlob(
      (blob) => (blob ? ok(blob) : fehler(new Error("PNG nicht erzeugt"))),
      "image/png",
    ),
  );
}

/**
 * Gibt das Bild ans Gerät : auf dem Handy über das Teilen-Menü (dort gibt es „Bild sichern“), sonst
 * als Download. Liefert „geteilt“ oder „geladen“ ; ein Abbruch im Teilen-Menü ist kein Fehler.
 */
export async function bildSpeichern(blob: Blob, dateiname: string): Promise<"geteilt" | "geladen"> {
  const datei = new File([blob], dateiname, { type: "image/png" });
  const nav = navigator as Navigator & {
    canShare?: (daten: ShareData) => boolean;
  };
  if (typeof nav.share === "function" && nav.canShare?.({ files: [datei] })) {
    try {
      await nav.share({ files: [datei] });
      return "geteilt";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "geteilt";
      // Teilen nicht möglich : Download als Rückfall.
    }
  }
  const adresse = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = adresse;
  link.download = dateiname;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(adresse), 10_000);
  return "geladen";
}
