"""Tests der Geschäftslogik: Bereinigung, Wählbarkeit, Versand, Löschfristen."""

from datetime import timedelta
from unittest import mock

import pytest
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from apps.notifications.models import Notification
from apps.wahlen import services, tasks
from apps.wahlen.models import BekanntmachungStatus, Kandidatur, Nachweis
from apps.wahlen.tests.factories import mitglied, neue_wahl

pytestmark = pytest.mark.django_db


def test_html_wird_bereinigt():
    roh = (
        '<p style="color:red" onclick="x()">Hallo <b>Welt</b></p><script>alert(1)</script>'
        '<a href="javascript:alert(1)">böse</a><a href="https://example.de/x">gut</a>'
        "<img src=x onerror=y>"
    )
    sauber = services.reinige_html(roh)
    assert "script" not in sauber and "onclick" not in sauber and "javascript" not in sauber
    assert "<img" not in sauber and "style" not in sauber
    assert '<a href="https://example.de/x" rel="noopener noreferrer">gut</a>' in sauber
    assert "<b>Welt</b>" in sauber
    assert services.reinige_html("<h2>Titel</h2>") == "<h2>Titel</h2>"


def test_html_zu_text():
    assert services.html_zu_text("<p>Eins</p><p>Zwei<br>drei</p>") == "Eins\nZwei\ndrei"


def test_waehlbarkeit_dauer_und_beitrag():
    wahl, _ = neue_wahl("liste")
    _, neu = mitglied(jahre=1)
    _, alt = mitglied(jahre=5)
    _, ohne_beitrag = mitglied(jahre=5, beitrag=False)
    assert services.waehlbarkeit(wahl, alt, "pres")["dauer_ok"] is True
    assert services.waehlbarkeit(wahl, neu, "cand")["dauer_ok"] is False
    assert services.waehlbarkeit(wahl, neu, "pres")["jahre_noetig"] == 3
    assert services.waehlbarkeit(wahl, ohne_beitrag, "cand")["aktiv_beitrag"] is False
    assert services.waehlbarkeit(wahl, alt, "cand")["kein_ausschuss"] is True


def test_ausschussmitglied_nicht_waehlbar():
    wahl, _ = neue_wahl("person")
    membre = wahl.ausschuss.first().membre
    assert services.waehlbarkeit(wahl, membre, "cand")["kein_ausschuss"] is False


def test_platzhalter_ersetzen():
    wahl, _ = neue_wahl("person")
    text = services.ersetze_platzhalter("{Wahl} bis {Frist} / {Datum}", wahl, "de")
    assert wahl.titel in text and wahl.kandidatur_bis.strftime("%d.%m.%Y") in text
    assert "{" not in text


def test_platzhalter_schutz_fuer_uebersetzung():
    geschuetzt = services._schuetze("Wahl {Wahl} bis {Frist}")
    assert "{Wahl}" not in geschuetzt
    assert services._entschuetze(geschuetzt) == "Wahl {Wahl} bis {Frist}"
    # DeepL kann den Platzhalter in ein Tag-Paar verwandeln
    assert services._entschuetze('Le <x id="Wahl"/></x> fin') == "Le {Wahl} fin"


def test_versand_app_und_mail_nur_einmal():
    wahl, _ = neue_wahl("person")
    for _ in range(2):
        mitglied()
    bk = wahl.bekanntmachungen.get(schluessel="aufruf")
    services.text_setzen(bk, "de", "Aufruf {Wahl}", "<p>Frist {Frist}</p>")
    services.text_setzen(bk, "fr", "Appel {Wahl}", "<p>Délai {Frist}</p>")
    bk.kanaele = ["app", "mail"]
    bk.status = BekanntmachungStatus.FREIGEGEBEN
    bk.versand_am = timezone.now() - timedelta(minutes=1)
    bk.save()
    mail.outbox.clear()
    anzahl = tasks.bekanntmachungen_senden()
    assert anzahl >= 2
    bk.refresh_from_db()
    assert bk.status == BekanntmachungStatus.GESENDET
    assert Notification.objects.filter(titre__startswith="Aufruf").count() == anzahl
    assert len(mail.outbox) == anzahl
    assert "<p>Frist" in mail.outbox[0].alternatives[0][0] or "Frist" in mail.outbox[0].body
    # Zweiter Lauf versendet nichts mehr
    assert tasks.bekanntmachungen_senden() == 0


def test_nicht_freigegebene_werden_nicht_versendet():
    wahl, _ = neue_wahl("person")
    bk = wahl.bekanntmachungen.get(schluessel="aufruf")
    bk.versand_am = timezone.now() - timedelta(minutes=1)
    bk.save()
    assert tasks.bekanntmachungen_senden() == 0


def _nachweis(wahl):
    k = Kandidatur.objects.create(wahl=wahl, einreicher=mitglied()[1])
    return Nachweis.objects.create(
        kandidatur=k,
        art="ehrenerklaerung",
        datei=SimpleUploadedFile("a.pdf", b"%PDF-1.4\n%%EOF\n", content_type="application/pdf"),
    )


def test_nachweise_werden_nach_frist_geloescht():
    wahl, _ = neue_wahl("person", aufbewahrung="30")
    _nachweis(wahl)
    heute = timezone.now()
    assert services.nachweise_loeschen(heute) == 0
    spaeter = heute + timedelta(days=(wahl.einspruch_bis - heute.date()).days + 31)
    assert services.nachweise_loeschen(spaeter) == 1
    assert Nachweis.objects.count() == 0


def test_manuelle_aufbewahrung_loescht_nie():
    wahl, _ = neue_wahl("person", aufbewahrung="manuell")
    _nachweis(wahl)
    assert services.nachweise_loeschen(timezone.now() + timedelta(days=3650)) == 0
    assert Nachweis.objects.count() == 1


def test_beat_aufgaben_sind_geplant():
    from django_celery_beat.models import PeriodicTask

    namen = set(
        PeriodicTask.objects.filter(name__startswith="wahlen.").values_list("name", flat=True)
    )
    assert namen == {
        "wahlen.bekanntmachungen_senden",
        "wahlen.mitteilungen_senden",
        "wahlen.nachweise_loeschen",
    }


def test_uebersetzen_ohne_deepl_verweigert():
    wahl, _ = neue_wahl("person")
    bk = wahl.bekanntmachungen.first()
    with pytest.raises(Exception):
        services.uebersetzen(bk, "fr")


def test_uebersetzen_mit_deepl():
    wahl, _ = neue_wahl("person")
    bk = wahl.bekanntmachungen.first()
    with (
        mock.patch("apps.uebersetzung.deepl.ist_aktiv", return_value=True),
        mock.patch(
            "apps.uebersetzung.deepl.uebersetzen",
            side_effect=lambda text, ziel, html=False: (f"[{ziel}] {text}", "de"),
        ),
    ):
        services.uebersetzen(bk, "fr")
    bk.refresh_from_db()
    assert bk.texte["fr"]["html"].startswith("[fr]") or "[fr]" in bk.texte["fr"]["html"]
    assert bk.geprueft["fr"] is False


def test_oeffnen_ja_nein_wahl_erzeugt_oui_non_abstention():
    wahl, (a, b, _c) = neue_wahl("ja_nein", mehrheit="zwei_drittel")
    Kandidatur.objects.create(
        wahl=wahl, einreicher=mitglied()[1], name="Antrag auf Satzungsänderung", status="zugelassen"
    )
    typ, nb, optionen, schwelle = services.optionen_fuer(wahl)
    assert (
        typ == "oui_non"
        and schwelle == 66
        and [o["label"] for o in optionen] == ["Oui", "Non", "Abstention"]
    )
    with mock.patch("apps.vote.tasks.envoyer_notification_ouverture.delay"):
        services.freigabe_geben(wahl, a, "oeffnen")
        ergebnis = services.freigabe_geben(wahl, b, "oeffnen")
    assert ergebnis["ausgefuehrt"] is True
    wahl.refresh_from_db()
    assert wahl.vote_session.type_vote == "oui_non"
    assert wahl.status == "aktiv"
