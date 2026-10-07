import DOMPurify from "dompurify";

// Hinweis: `target` entfernt DOMPurify von sich aus — Links aus Beiträgen haben kein `window.opener`.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  // Inline-Styles nur für die Textausrichtung des Editors (TipTap TextAlign) — kein
  // `position:fixed`-Overlay o. ä.
  const stil = node.getAttribute("style");
  if (stil !== null) {
    const ausrichtung = /(?:^|;)\s*text-align:\s*(left|right|center|justify)\s*(?:;|$)/i.exec(stil);
    if (ausrichtung) node.setAttribute("style", `text-align: ${ausrichtung[1].toLowerCase()}`);
    else node.removeAttribute("style");
  }
});

/**
 * Bereinigt vom Server gelieferten HTML-Text (Beiträge, Projekt-/Veranstaltungsbeschreibungen,
 * Berichte) vor `dangerouslySetInnerHTML` — Schutz gegen gespeichertes XSS (Sicherheitsprüfung
 * 2026-10-07). Erlaubt das übliche Editor-HTML (Absätze, Listen, Links, Bilder, Tabellen) und die
 * `data-*`-Attribute der @-Erwähnungen; Skripte, Event-Handler und `javascript:`-Links entfallen.
 */
export function bereinigeHtml(html: string | null | undefined): string {
  return DOMPurify.sanitize(html ?? "", {
    USE_PROFILES: { html: true },
    // Keine Formulare/Steuerelemente und kein <style> in Beiträgen (Phishing-/Layout-Missbrauch).
    FORBID_TAGS: ["style", "form", "input", "button", "textarea", "select"],
  });
}
