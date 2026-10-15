"""Formatierter Text der Regionsseiten (Release 30).

Beschreibung, Vorstellung, Beiträge und Treffen werden im Word-ähnlichen Editor geschrieben und
als HTML gespeichert. Weil auch Verantwortliche (keine Büro-Rolle) schreiben, wird jede Eingabe
serverseitig auf eine feste Liste harmloser Elemente reduziert (keine Skripte, Stile, Bilder,
Ereignisattribute) ; Links dürfen nur auf http(s) und mailto zeigen. Älterer Klartext bleibt
gültig und wird beim Anzeigen als Klartext behandelt."""

import re
from html import escape
from html.parser import HTMLParser

from django.utils.html import strip_tags
from django.utils.safestring import mark_safe

ERLAUBT = {
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "ul",
    "ol",
    "li",
    "h2",
    "h3",
    "blockquote",
    "a",
}
LEER = {"br"}
# Inhalt dieser Elemente wird samt Element verworfen.
VERWORFEN = {"script", "style", "iframe", "object", "embed", "template", "noscript", "svg", "math"}
AUSRICHTUNG = re.compile(r"^\s*text-align\s*:\s*(left|right|center|justify)\s*;?\s*$", re.I)
LINK = re.compile(r"^(https?://|mailto:)", re.I)
TAG_ERKENNUNG = re.compile(r"<[a-zA-Z/!]")


class _Bereiniger(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.teile: list[str] = []
        self.offen: list[tuple[str, bool]] = []
        self.verworfen = 0

    def handle_starttag(self, tag, attrs):
        if tag in VERWORFEN:
            self.verworfen += 1
            return
        if self.verworfen or tag not in ERLAUBT:
            return
        attribute = dict(attrs)
        zusatz = ""
        if tag == "a":
            ziel = (attribute.get("href") or "").strip()
            if not LINK.match(ziel):
                # Unerlaubtes Ziel : der Text bleibt, der Link entfällt.
                self.offen.append((tag, False))
                return
            zusatz = f' href="{escape(ziel, quote=True)}" target="_blank" rel="noopener noreferrer"'
        elif tag in {"p", "h2", "h3"}:
            treffer = AUSRICHTUNG.match(attribute.get("style") or "")
            if treffer:
                zusatz = f' style="text-align: {treffer.group(1).lower()}"'
        self.teile.append(f"<{tag}{zusatz}>")
        if tag not in LEER:
            self.offen.append((tag, True))

    def handle_startendtag(self, tag, attrs):
        if tag == "br" and not self.verworfen:
            self.teile.append("<br>")

    def handle_endtag(self, tag):
        if tag in VERWORFEN:
            self.verworfen = max(0, self.verworfen - 1)
            return
        if self.verworfen:
            return
        if any(name == tag for name, _ in self.offen):
            while self.offen:
                name, ausgeben = self.offen.pop()
                if ausgeben:
                    self.teile.append(f"</{name}>")
                if name == tag:
                    return

    def handle_data(self, data):
        if not self.verworfen:
            self.teile.append(escape(data, quote=False))

    def ergebnis(self) -> str:
        for name, ausgeben in reversed(self.offen):
            if ausgeben:
                self.teile.append(f"</{name}>")
        return "".join(self.teile)


def ist_html(text: str) -> bool:
    return bool(TAG_ERKENNUNG.search(text or ""))


def bereinige(text: str) -> str:
    """Reduziert HTML auf die erlaubten Elemente ; Klartext bleibt unverändert."""
    if not ist_html(text):
        return (text or "").strip()
    bereiniger = _Bereiniger()
    bereiniger.feed(text)
    bereiniger.close()
    ergebnis = bereiniger.ergebnis().strip()
    return "" if klartext(ergebnis) == "" else ergebnis


def klartext(text: str) -> str:
    """Nur der sichtbare Text (für Längenprüfung, Vorschau, Linkvorschau, Meldungen)."""
    if not ist_html(text):
        return (text or "").strip()
    ohne = re.sub(r"</(p|li|h2|h3|blockquote)>|<br\s*/?>", " ", text or "", flags=re.I)
    from html import unescape

    return re.sub(r"\s+", " ", unescape(strip_tags(ohne))).strip()


def anzeige(text: str):
    """HTML für Vorlagen : formatierter Text bleibt formatiert, Klartext behält seine Zeilen."""
    if ist_html(text):
        return mark_safe(bereinige(text))  # noqa: S308 – nach Bereinigung
    return mark_safe(escape(text or "").replace("\n", "<br>"))  # noqa: S308 – maskiert
