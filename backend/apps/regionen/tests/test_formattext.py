"""Formatierter Text (Release 30) : Bereinigung, Klartext, Speichern über die API."""

import pytest

from apps.regionen import formattext
from apps.regionen.models import Region
from apps.regionen.tests.test_regionen import BASIS, _client, _mitglied, _verantwortlicher

pytestmark = pytest.mark.django_db


class TestBereinige:
    def test_klartext_bleibt_unveraendert(self):
        assert formattext.bereinige("  Hallo\nWelt ") == "Hallo\nWelt"
        assert formattext.klartext("Hallo\nWelt") == "Hallo\nWelt"

    def test_erlaubte_formatierung_bleibt(self):
        html = (
            "<h2>Titel</h2><p><strong>fett</strong> und <em>kursiv</em><br>Zeile</p>"
            "<ul><li>a</li></ul>"
        )
        assert formattext.bereinige(html) == html

    def test_skripte_stile_und_ereignisse_entfallen(self):
        roh = (
            '<p onclick="x()">Hi<script>alert(1)</script></p><style>p{}</style>'
            '<img src=x onerror=alert(1)><iframe src="//e"></iframe>'
        )
        assert formattext.bereinige(roh) == "<p>Hi</p>"

    def test_links_nur_http_mailto(self):
        gut = formattext.bereinige('<p><a href="https://cid.de/x?a=1&b=2">Link</a></p>')
        assert 'href="https://cid.de/x?a=1&amp;b=2"' in gut and 'rel="noopener noreferrer"' in gut
        assert (
            formattext.bereinige('<p><a href="javascript:alert(1)">Klick</a></p>') == "<p>Klick</p>"
        )
        assert "mailto:a@b.de" in formattext.bereinige('<a href="mailto:a@b.de">Mail</a>')

    def test_ausrichtung_nur_erlaubte_werte(self):
        assert 'style="text-align: center"' in formattext.bereinige(
            '<p style="text-align: center">x</p>'
        )
        assert formattext.bereinige('<p style="color:red;background:url(x)">x</p>') == "<p>x</p>"

    def test_unbekannte_elemente_verlieren_nur_das_element(self):
        assert formattext.bereinige("<div><span>Text</span></div>") == "Text"

    def test_offene_elemente_werden_geschlossen(self):
        assert formattext.bereinige("<p><strong>offen") == "<p><strong>offen</strong></p>"

    def test_leerer_editorinhalt_ist_leer(self):
        assert formattext.bereinige("<p></p>") == ""
        assert formattext.bereinige("<p><br></p>") == ""

    def test_klartext_zaehlt_nur_sichtbares(self):
        assert (
            formattext.klartext("<p>Hallo&nbsp;<strong>Welt</strong></p><p>Zwei</p>")
            == "Hallo Welt Zwei"
        )

    def test_anzeige_maskiert_klartext(self):
        assert str(formattext.anzeige("<p>x</p><script>y</script>")) == "<p>x</p>"
        assert str(formattext.anzeige("a < b\nzwei")) == "a &lt; b<br>zwei"


class TestApi:
    def test_beschreibung_wird_bereinigt_gespeichert(self):
        user = _mitglied("HH")
        nord = Region.objects.get(slug="nord")
        _verantwortlicher(nord, user)
        r = _client(user).patch(
            f"{BASIS}nord/",
            {"beschreibung_de": "<p>Moin <strong>alle</strong><script>x</script></p>"},
            format="json",
        )
        assert r.status_code == 200
        assert r.data["beschreibung"]["de"] == "<p>Moin <strong>alle</strong></p>"

    def test_laenge_zaehlt_sichtbaren_text(self):
        user = _mitglied("HH")
        _verantwortlicher(Region.objects.get(slug="nord"), user)
        c = _client(user)
        lang = "<p>" + "a" * 4001 + "</p>"
        assert c.patch(f"{BASIS}nord/", {"beschreibung_de": lang}, format="json").status_code == 400
        ok = "<p>" + "<strong>a</strong>" * 2000 + "</p>"
        assert c.patch(f"{BASIS}nord/", {"beschreibung_de": ok}, format="json").status_code == 200

    def test_beitrag_pflicht_trotz_leerem_editor(self):
        user = _mitglied("HH")
        _verantwortlicher(Region.objects.get(slug="nord"), user)
        r = _client(user).post(
            f"{BASIS}nord/beitraege/", {"titel": "T", "text": "<p></p>"}, format="json"
        )
        assert r.status_code == 400
        r = _client(user).post(
            f"{BASIS}nord/beitraege/", {"titel": "T", "text": "<p>Hallo</p>"}, format="json"
        )
        assert r.status_code == 201 and r.data["text"] == "<p>Hallo</p>"

    def test_vorstellung_und_oeffentliche_seite(self):
        user = _mitglied("HH")
        nord = Region.objects.get(slug="nord")
        karte = _verantwortlicher(nord, user)
        r = _client(user).patch(
            f"{BASIS}nord/verantwortliche/{karte.pk}/",
            {"vorstellung": "<p>Ich bin <em>Sami</em></p>"},
            format="json",
        )
        assert r.status_code == 200
        karte.refresh_from_db()
        assert karte.vorstellung == "<p>Ich bin <em>Sami</em></p>"
