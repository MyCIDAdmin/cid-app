/**
 * Texte des Regionen-Moduls (Release 30) : Seit der Umstellung auf den Word-ähnlichen Editor wird
 * HTML gespeichert (das Backend bereinigt es, apps.regionen.formattext) ; ältere Einträge sind
 * einfacher Text mit Zeilenumbrüchen. Gleiche Erkennungsregel wie im Backend.
 */
export function istHtml(text: string): boolean {
  return /<[a-zA-Z/!]/.test(text);
}

/** Sichtbarer Text ohne Formatierung (Vorschauen, Zeichenzähler). */
export function klartext(text: string): string {
  if (!istHtml(text)) return text.trim();
  const doc = new DOMParser().parseFromString(
    text.replace(/<\/(p|h2|h3|li|blockquote)>|<br\s*\/?>/gi, " "),
    "text/html",
  );
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
}
