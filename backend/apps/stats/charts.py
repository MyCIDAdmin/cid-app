"""Server-seitig erzeugte SVG-Diagramme für das Dashboard-PDF (WeasyPrint rendert inline <svg>,
nicht aber die Recharts-Diagramme der Oberfläche). Alle Funktionen liefern einen eigenständigen
SVG-String (kein Skript, keine externen Ressourcen)."""

from html import escape

ROT = "#CC0000"
DUNKELROT = "#8B0000"
GRAU = "#8a8a8a"
GRAPHIT = "#3d4148"
GRUEN = "#2f855a"
BERNSTEIN = "#d98e04"
BLAUGRAU = "#5b7a99"
PALETTE = [ROT, GRAPHIT, BERNSTEIN, BLAUGRAU, GRUEN, DUNKELROT, GRAU]


def _svg(breite, hoehe, inhalt):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 {breite} {hoehe}" '
        f'font-family="DejaVu Sans, Arial, sans-serif">{inhalt}</svg>'
    )


def _kurz(text, maximal):
    text = str(text)
    return text if len(text) <= maximal else text[: maximal - 1] + "…"


def balken_horizontal(eintraege, *, formatierer=lambda v: f"{v:g}", farbe=ROT, breite=520):
    """Horizontale Balken: eintraege = [(Beschriftung, Wert), ...]."""
    if not eintraege:
        return ""
    zeile, rand_links, rand_rechts = 20, 150, 70
    maxi = max([float(w) for _, w in eintraege] + [1e-9])
    hoehe = zeile * len(eintraege) + 8
    teile = []
    for i, (label, wert) in enumerate(eintraege):
        y = 4 + i * zeile
        laenge = max(float(wert), 0) / maxi * (breite - rand_links - rand_rechts)
        teile.append(
            f'<text x="{rand_links - 6}" y="{y + 12}" font-size="9" fill="#333" '
            f'text-anchor="end">{escape(_kurz(label, 26))}</text>'
            f'<rect x="{rand_links}" y="{y + 2}" width="{laenge:.1f}" height="12" rx="2" '
            f'fill="{farbe}"/>'
            f'<text x="{rand_links + laenge + 5:.1f}" y="{y + 12}" font-size="9" fill="#333">'
            f"{escape(formatierer(wert))}</text>"
        )
    return _svg(breite, hoehe, "".join(teile))


def balken_gruppiert(rubriken, serien, *, breite=520, hoehe=170):
    """Gruppierte Säulen. rubriken = [Beschriftung], serien = [(Name, Farbe, [Werte])]."""
    if not rubriken:
        return ""
    rand_u, rand_o, rand_x = 20, 22, 14
    maxi = max([float(w) for _, _, werte in serien for w in werte] + [1.0])
    pas = (breite - 2 * rand_x) / len(rubriken)
    breite_balken = pas * 0.8 / max(len(serien), 1)
    teile = [
        f'<line x1="{rand_x}" y1="{hoehe - rand_u}" x2="{breite - rand_x}" y2="{hoehe - rand_u}" '
        f'stroke="#ccc"/>'
    ]
    for i, label in enumerate(rubriken):
        x0 = rand_x + i * pas + pas * 0.1
        for j, (_, farbe, werte) in enumerate(serien):
            h = max(float(werte[i]), 0) / maxi * (hoehe - rand_u - rand_o)
            teile.append(
                f'<rect x="{x0 + j * breite_balken:.1f}" y="{hoehe - rand_u - h:.1f}" '
                f'width="{breite_balken - 1:.1f}" height="{h:.1f}" fill="{farbe}"/>'
            )
        teile.append(
            f'<text x="{rand_x + i * pas + pas / 2:.1f}" y="{hoehe - 7}" font-size="8" '
            f'fill="#555" text-anchor="middle">{escape(_kurz(label, 9))}</text>'
        )
    # Legende oben links
    x = rand_x
    for name, farbe, _ in serien:
        teile.append(
            f'<rect x="{x}" y="4" width="8" height="8" fill="{farbe}"/>'
            f'<text x="{x + 12}" y="11" font-size="9" fill="#333">{escape(name)}</text>'
        )
        x += 24 + len(name) * 5
    return _svg(breite, hoehe, "".join(teile))


def ring(eintraege, *, breite=260, hoehe=130):
    """Ringdiagramm mit Legende: eintraege = [(Beschriftung, Wert)]."""
    import math

    summe = sum(float(w) for _, w in eintraege)
    if summe <= 0:
        return ""
    cx, cy, r, dicke = 62, hoehe / 2, 52, 22
    teile, winkel = [], -math.pi / 2
    for i, (label, wert) in enumerate(eintraege):
        anteil = float(wert) / summe
        if anteil <= 0:
            continue
        farbe = PALETTE[i % len(PALETTE)]
        if anteil >= 0.9999:
            teile.append(
                f'<circle cx="{cx}" cy="{cy}" r="{r - dicke / 2}" fill="none" stroke="{farbe}" '
                f'stroke-width="{dicke}"/>'
            )
        else:
            ende = winkel + anteil * 2 * math.pi
            x1, y1 = cx + r * math.cos(winkel), cy + r * math.sin(winkel)
            x2, y2 = cx + r * math.cos(ende), cy + r * math.sin(ende)
            ri = r - dicke
            x3, y3 = cx + ri * math.cos(ende), cy + ri * math.sin(ende)
            x4, y4 = cx + ri * math.cos(winkel), cy + ri * math.sin(winkel)
            gross = 1 if anteil > 0.5 else 0
            teile.append(
                f'<path d="M{x1:.1f},{y1:.1f} A{r},{r} 0 {gross} 1 {x2:.1f},{y2:.1f} '
                f'L{x3:.1f},{y3:.1f} A{ri},{ri} 0 {gross} 0 {x4:.1f},{y4:.1f} Z" fill="{farbe}"/>'
            )
            winkel = ende
    for i, (label, wert) in enumerate(eintraege):
        y = 20 + i * 18
        teile.append(
            f'<rect x="135" y="{y - 8}" width="9" height="9" fill="{PALETTE[i % len(PALETTE)]}"/>'
            f'<text x="150" y="{y}" font-size="9" fill="#333">{escape(_kurz(label, 18))} '
            f"({float(wert):g})</text>"
        )
    return _svg(breite, hoehe, "".join(teile))


def fortschritt(anteil_prozent, *, breite=200):
    """Einzelner Fortschrittsbalken (0–100 %)."""
    p = max(0.0, min(100.0, float(anteil_prozent)))
    return _svg(
        breite,
        12,
        f'<rect x="0" y="2" width="{breite}" height="8" rx="4" fill="#e5e5e5"/>'
        f'<rect x="0" y="2" width="{breite * p / 100:.1f}" height="8" rx="4" fill="{ROT}"/>',
    )
