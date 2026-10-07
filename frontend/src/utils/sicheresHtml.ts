import DOMPurify from "dompurify";

/**
 * Bereinigt vom Server gelieferten HTML-Text (Beiträge, Projekt-/Veranstaltungsbeschreibungen,
 * Berichte) vor `dangerouslySetInnerHTML` — Schutz gegen gespeichertes XSS (Sicherheitsprüfung
 * 2026-10-07). Erlaubt das übliche Editor-HTML (Absätze, Listen, Links, Bilder, Tabellen) und die
 * `data-*`-Attribute der @-Erwähnungen; Skripte, Event-Handler und `javascript:`-Links entfallen.
 */
export function bereinigeHtml(html: string | null | undefined): string {
  return DOMPurify.sanitize(html ?? "", { USE_PROFILES: { html: true } });
}
