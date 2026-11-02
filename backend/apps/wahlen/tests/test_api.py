"""API-Tests der App wahlen: Anlage, Kandidatur-Ablauf, Zwei-Freigaben-Prinzip, Zugriff (IDOR)."""

import io
from datetime import timedelta
from unittest import mock

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from apps.wahlen.models import (
    Bekanntmachung,
    BekanntmachungStatus,
    Kandidatur,
    KandidaturStatus,
    Nachweis,
    Wahl,
)
from apps.wahlen.tests.factories import mitglied, neue_wahl, termine, verwaltung

pytestmark = pytest.mark.django_db

BASIS = "/api/v1/wahlen/"
PDF = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n"


def als(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def png():
    puffer = io.BytesIO()
    Image.new("RGB", (8, 8), "white").save(puffer, "PNG")
    return SimpleUploadedFile("foto.png", puffer.getvalue(), content_type="image/png")


def pdf(name="nachweis.pdf", inhalt=PDF):
    return SimpleUploadedFile(name, inhalt, content_type="application/pdf")


def ausfuellen(client, k, wahl):
    """Alles ausfüllen, was zum Einreichen einer Einzelkandidatur nötig ist."""
    antwort = client.patch(
        f"{BASIS}kandidaturen/{k['id']}/",
        {
            "leitsatz": "Gemeinsam mehr",
            "vorstellung": "Ich bin seit Jahren dabei.",
            "programm": ["Eins", "Zwei", "Drei"],
            "rechte_foto": True,
            "bestaetigt_wahlordnung": True,
            "bestaetigt_fairness": True,
            "bestaetigt_datenschutz": True,
        },
        format="json",
    )
    assert antwort.status_code == 200, antwort.data
    person = antwort.data["personen"][0]["id"]
    assert (
        client.post(
            f"{BASIS}kandidaturen/{k['id']}/foto/",
            {"person": person, "foto": png()},
            format="multipart",
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"{BASIS}kandidaturen/{k['id']}/nachweis/",
            {"art": "ehrenerklaerung", "person": person, "datei": pdf()},
            format="multipart",
        ).status_code
        == 200
    )


def unterstuetzer(k_id, anzahl):
    for _ in range(anzahl):
        user, _membre = mitglied()
        assert als(user).post(f"{BASIS}kandidaturen/{k_id}/unterstuetzen/").status_code in (
            200,
            201,
        )


# ------------------------------------------------------------------ Wahl anlegen


def _payload():
    t = termine("ankuendigung")
    return {
        "titel": "Neuwahl",
        "form": "liste",
        "mehrheit": "absolut",
        **{k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in t.items()},
    }


def test_wahl_anlegen_nur_verwaltung():
    user, _ = mitglied()
    assert als(user).post(BASIS, _payload(), format="json").status_code == 403
    antwort = als(verwaltung()).post(BASIS, _payload(), format="json")
    assert antwort.status_code == 201
    wahl = Wahl.objects.get()
    assert wahl.status == "entwurf" and wahl.bekanntmachungen.count() == 5


def test_wahl_termine_reihenfolge_und_dauer():
    daten = _payload()
    daten["kandidatur_bis"] = (timezone.localdate() - timedelta(days=400)).isoformat()
    assert als(verwaltung()).post(BASIS, daten, format="json").status_code == 400
    daten = _payload()
    daten["wahl_bis"] = (timezone.now() + timedelta(days=60)).isoformat()
    assert als(verwaltung()).post(BASIS, daten, format="json").status_code == 400


def test_entwurf_unsichtbar_fuer_mitglieder_sichtbar_fuer_ausschuss():
    wahl, ausschuss = neue_wahl(aktiv=False)
    fremd, _ = mitglied()
    assert als(fremd).get(f"{BASIS}{wahl.id}/").status_code == 404
    assert als(ausschuss[0]).get(f"{BASIS}{wahl.id}/").status_code == 200


def test_listengroesse_zwischen_1_und_7():
    for groesse, erwartet in ((1, 201), (7, 201), (8, 400), (0, 400)):
        daten = {**_payload(), "listen_groesse": groesse}
        assert als(verwaltung()).post(BASIS, daten, format="json").status_code == erwartet


def test_ausschuss_drei_bis_fuenf_und_keine_kandidaten():
    wahl, _ = neue_wahl(ausschuss=0, aktiv=False)
    admin = als(verwaltung())
    for _ in range(5):
        _, m = mitglied()
        assert (
            admin.post(
                f"{BASIS}{wahl.id}/ausschuss/", {"membre": str(m.id)}, format="json"
            ).status_code
            == 200
        )
    _, sechstes = mitglied()
    assert (
        admin.post(
            f"{BASIS}{wahl.id}/ausschuss/", {"membre": str(sechstes.id)}, format="json"
        ).status_code
        == 400
    )
    wahl2, _ = neue_wahl(ausschuss=2, aktiv=False)
    assert admin.post(f"{BASIS}{wahl2.id}/veroeffentlichen/").status_code == 400


# ------------------------------------------------------------------ Kandidatur


def test_kandidatur_ablauf_bis_zulassung_und_oeffnen():
    wahl, (a, b, c) = neue_wahl("person")
    user, membre = mitglied()
    client = als(user)
    k = client.post(f"{BASIS}kandidaturen/", {"wahl": str(wahl.id)}, format="json")
    assert k.status_code == 201
    k = k.data
    assert "unterstuetzungen" in k["fehlend"]

    # Einreichen ohne alle Angaben schlägt fehl
    assert client.post(f"{BASIS}kandidaturen/{k['id']}/einreichen/").status_code == 400

    ausfuellen(client, k, wahl)
    unterstuetzer(k["id"], wahl.unterstuetzungen_noetig)
    antwort = client.post(f"{BASIS}kandidaturen/{k['id']}/einreichen/")
    assert antwort.status_code == 200, antwort.data
    assert antwort.data["status"] == "eingereicht"

    # Zulassen geht erst, wenn alle Prüfpunkte in Ordnung sind
    ausschuss = als(a)
    assert (
        ausschuss.post(
            f"{BASIS}kandidaturen/{k['id']}/entscheidung/", {"art": "zulassen"}, format="json"
        ).status_code
        == 400
    )
    for punkt in ("unterstuetzungen", "ehrenerklaerung", "foto", "programm"):
        assert (
            ausschuss.post(
                f"{BASIS}kandidaturen/{k['id']}/pruefpunkt/",
                {"schluessel": punkt, "ergebnis": "ok"},
                format="json",
            ).status_code
            == 200
        )
    antwort = ausschuss.post(
        f"{BASIS}kandidaturen/{k['id']}/entscheidung/", {"art": "zulassen"}, format="json"
    )
    assert antwort.status_code == 200, antwort.data
    # Eine Stimme genügt nicht (Vier-Augen-Prinzip)
    assert Kandidatur.objects.get().status == KandidaturStatus.EINGEREICHT
    eid = antwort.data["entscheidung_offen"]["id"]
    # dieselbe Person kann nicht zweimal zustimmen
    assert (
        ausschuss.post(f"{BASIS}kandidaturen/{k['id']}/entscheidung/{eid}/zustimmen/").status_code
        == 400
    )
    assert (
        als(b).post(f"{BASIS}kandidaturen/{k['id']}/entscheidung/{eid}/zustimmen/").status_code
        == 200
    )
    assert Kandidatur.objects.get().status == KandidaturStatus.ZUGELASSEN

    # Wahl öffnen: zwei Freigaben, danach existiert eine Abstimmung
    with mock.patch("apps.vote.tasks.envoyer_notification_ouverture.delay"):
        antwort = als(a).post(f"{BASIS}{wahl.id}/freigabe/", {"art": "oeffnen"}, format="json")
        assert antwort.status_code == 200 and antwort.data["ausgefuehrt"] is False
        antwort = als(b).post(f"{BASIS}{wahl.id}/freigabe/", {"art": "oeffnen"}, format="json")
    assert antwort.data["ausgefuehrt"] is True
    wahl.refresh_from_db()
    assert wahl.vote_session is not None and wahl.vote_session.statut == "ouverte"
    assert [o.label for o in wahl.vote_session.options.all()] == [f"{membre.prenom} {membre.nom}"]


def test_ablehnen_braucht_begruendung_und_artikel():
    wahl, (a, b, _c) = neue_wahl("person")
    k = Kandidatur.objects.create(wahl=wahl, einreicher=mitglied()[1], status="eingereicht")
    punkt = als(a).post(
        f"{BASIS}kandidaturen/{k.id}/entscheidung/", {"art": "ablehnen"}, format="json"
    )
    assert punkt.status_code == 400
    ok = als(a).post(
        f"{BASIS}kandidaturen/{k.id}/entscheidung/",
        {"art": "ablehnen", "begruendung": "Frist nicht eingehalten", "artikel": "Art. 7 Abs. 2"},
        format="json",
    )
    assert ok.status_code == 200


def test_nur_ein_nachbesserungsversuch():
    wahl, (a, b, _c) = neue_wahl("person")
    k = Kandidatur.objects.create(
        wahl=wahl, einreicher=mitglied()[1], status="eingereicht", nachbesserungen=1
    )
    antwort = als(a).post(
        f"{BASIS}kandidaturen/{k.id}/entscheidung/",
        {"art": "rueckfrage", "begruendung": "Foto fehlt"},
        format="json",
    )
    assert antwort.status_code == 400


def test_nicht_waehlbar_wegen_mitgliedsdauer_wird_nicht_eingereicht():
    wahl, _ = neue_wahl("person")
    user, _ = mitglied(jahre=0)
    client = als(user)
    k = client.post(f"{BASIS}kandidaturen/", {"wahl": str(wahl.id)}, format="json").data
    ausfuellen(client, k, wahl)
    unterstuetzer(k["id"], wahl.unterstuetzungen_noetig)
    antwort = client.post(f"{BASIS}kandidaturen/{k['id']}/einreichen/")
    assert antwort.status_code == 400 and "eingangspruefung" in antwort.data["details"]


def test_unterstuetzung_nur_einmal_je_wahl():
    wahl, _ = neue_wahl("person")
    k1 = Kandidatur.objects.create(wahl=wahl, einreicher=mitglied()[1])
    k2 = Kandidatur.objects.create(wahl=wahl, einreicher=mitglied()[1])
    user, _ = mitglied()
    assert als(user).post(f"{BASIS}kandidaturen/{k1.id}/unterstuetzen/").status_code == 200
    assert als(user).post(f"{BASIS}kandidaturen/{k2.id}/unterstuetzen/").status_code == 400


def test_ausschussmitglied_kann_nicht_kandidieren():
    wahl, (a, _b, _c) = neue_wahl("person")
    assert (
        als(a).post(f"{BASIS}kandidaturen/", {"wahl": str(wahl.id)}, format="json").status_code
        == 400
    )


def test_kandidatur_ausserhalb_der_frist_nicht_moeglich():
    wahl, _ = neue_wahl("person", phase="pruefung")
    user, _ = mitglied()
    assert (
        als(user).post(f"{BASIS}kandidaturen/", {"wahl": str(wahl.id)}, format="json").status_code
        == 400
    )


# ------------------------------------------------------------------ Zugriff / IDOR


def test_fremde_sehen_dossier_nicht():
    wahl, (a, _b, _c) = neue_wahl("person")
    eigentuemer, membre = mitglied()
    k = Kandidatur.objects.create(wahl=wahl, einreicher=membre, status="eingereicht")
    fremd, _ = mitglied()
    assert als(fremd).get(f"{BASIS}kandidaturen/{k.id}/").status_code == 403
    assert als(fremd).get(f"{BASIS}kandidaturen/?wahl={wahl.id}").data == []
    assert als(eigentuemer).get(f"{BASIS}kandidaturen/{k.id}/").status_code == 200
    assert als(a).get(f"{BASIS}kandidaturen/{k.id}/").status_code == 200


def test_fremde_koennen_dossier_nicht_aendern_oder_hochladen():
    wahl, _ = neue_wahl("person")
    _eigen, membre = mitglied()
    k = Kandidatur.objects.create(wahl=wahl, einreicher=membre)
    fremd, _ = mitglied()
    client = als(fremd)
    assert (
        client.patch(f"{BASIS}kandidaturen/{k.id}/", {"name": "x"}, format="json").status_code
        == 403
    )
    assert (
        client.post(
            f"{BASIS}kandidaturen/{k.id}/nachweis/",
            {"art": "abschluss", "datei": pdf()},
            format="multipart",
        ).status_code
        == 403
    )
    assert client.post(f"{BASIS}kandidaturen/{k.id}/einreichen/").status_code == 403
    assert client.post(f"{BASIS}kandidaturen/{k.id}/zurueckziehen/").status_code == 403


def test_nur_ausschuss_entscheidet_und_sieht_nachweise():
    wahl, (a, _b, _c) = neue_wahl("person")
    eigen, membre = mitglied()
    k = Kandidatur.objects.create(wahl=wahl, einreicher=membre, status="eingereicht")
    n = Nachweis.objects.create(kandidatur=k, art="ehrenerklaerung", datei=pdf())
    assert (
        als(eigen)
        .post(f"{BASIS}kandidaturen/{k.id}/entscheidung/", {"art": "zulassen"}, format="json")
        .status_code
        == 403
    )
    assert als(eigen).get(f"{BASIS}kandidaturen/{k.id}/nachweis/{n.id}/").status_code == 403
    assert als(a).get(f"{BASIS}kandidaturen/{k.id}/nachweis/{n.id}/").status_code == 200
    # Kein Zugriff auf den Nachweis über eine fremde Kandidatur
    k2 = Kandidatur.objects.create(wahl=wahl, einreicher=mitglied()[1], status="eingereicht")
    assert als(a).get(f"{BASIS}kandidaturen/{k2.id}/nachweis/{n.id}/").status_code == 404


def test_upload_mime_pruefung():
    wahl, _ = neue_wahl("person")
    user, _ = mitglied()
    client = als(user)
    k = client.post(f"{BASIS}kandidaturen/", {"wahl": str(wahl.id)}, format="json").data
    boese = SimpleUploadedFile(
        "evil.pdf", b"<html><script>alert(1)</script></html>", content_type="application/pdf"
    )
    antwort = client.post(
        f"{BASIS}kandidaturen/{k['id']}/nachweis/",
        {"art": "ehrenerklaerung", "datei": boese},
        format="multipart",
    )
    assert antwort.status_code == 400
    gross = SimpleUploadedFile(
        "gross.pdf", PDF + b"0" * (5 * 1024 * 1024), content_type="application/pdf"
    )
    assert (
        client.post(
            f"{BASIS}kandidaturen/{k['id']}/nachweis/",
            {"art": "ehrenerklaerung", "datei": gross},
            format="multipart",
        ).status_code
        == 400
    )


def test_wahl_aendern_und_aufbewahrung():
    wahl, (a, _b, _c) = neue_wahl("person")
    fremd, _ = mitglied()
    assert als(fremd).patch(f"{BASIS}{wahl.id}/", {"titel": "x"}, format="json").status_code == 403
    assert (
        als(fremd)
        .post(f"{BASIS}{wahl.id}/aufbewahrung/", {"aufbewahrung": "30"}, format="json")
        .status_code
        == 403
    )
    assert (
        als(a)
        .post(f"{BASIS}{wahl.id}/aufbewahrung/", {"aufbewahrung": "365"}, format="json")
        .status_code
        == 200
    )
    assert (
        als(a)
        .post(f"{BASIS}{wahl.id}/aufbewahrung/", {"aufbewahrung": "7"}, format="json")
        .status_code
        == 400
    )
    wahl.refresh_from_db()
    assert wahl.aufbewahrung == "365"


def test_freigabe_zum_schliessen_braucht_zwei_und_offene_wahl():
    wahl, (a, b, _c) = neue_wahl("person")
    assert (
        als(a).post(f"{BASIS}{wahl.id}/freigabe/", {"art": "schliessen"}, format="json").status_code
        == 400
    )
    fremd, _ = mitglied()
    assert (
        als(fremd)
        .post(f"{BASIS}{wahl.id}/freigabe/", {"art": "oeffnen"}, format="json")
        .status_code
        == 403
    )


def test_oeffnen_ohne_zugelassene_kandidatur_verweigert():
    wahl, (a, _b, _c) = neue_wahl("person")
    assert (
        als(a).post(f"{BASIS}{wahl.id}/freigabe/", {"art": "oeffnen"}, format="json").status_code
        == 400
    )


# ------------------------------------------------------------------ Bekanntmachungen


def test_bekanntmachung_nur_fuer_ausschuss_und_verwaltung():
    wahl, (a, _b, _c) = neue_wahl("person")
    fremd, _ = mitglied()
    bk = wahl.bekanntmachungen.first()
    assert als(fremd).get(f"{BASIS}bekanntmachungen/?wahl={wahl.id}").status_code == 403
    assert als(fremd).get(f"{BASIS}bekanntmachungen/{bk.id}/").status_code == 403
    assert (
        als(fremd)
        .patch(f"{BASIS}bekanntmachungen/{bk.id}/", {"html": "x"}, format="json")
        .status_code
        == 403
    )
    assert als(a).get(f"{BASIS}bekanntmachungen/?wahl={wahl.id}").status_code == 200


def test_bekanntmachung_ablauf_zwei_freigaben_und_versand():
    wahl, (a, b, _c) = neue_wahl("person")
    bk = wahl.bekanntmachungen.get(schluessel="aufruf")
    client = als(a)
    antwort = client.patch(
        f"{BASIS}bekanntmachungen/{bk.id}/",
        {
            "sprache": "de",
            "betreff": "Aufruf {Wahl}",
            "html": "<p onclick='x()'>Bis {Frist}</p><script>alert(1)</script>",
        },
        format="json",
    )
    assert antwort.status_code == 200
    bk.refresh_from_db()
    assert "script" not in bk.texte["de"]["html"] and "onclick" not in bk.texte["de"]["html"]
    assert client.post(f"{BASIS}bekanntmachungen/{bk.id}/vorlegen/").status_code == 200
    # Im Status „wartet“ ist der Text gesperrt
    assert (
        client.patch(
            f"{BASIS}bekanntmachungen/{bk.id}/", {"html": "<p>neu</p>"}, format="json"
        ).status_code
        == 400
    )
    assert client.post(f"{BASIS}bekanntmachungen/{bk.id}/freigeben/").status_code == 200
    bk.refresh_from_db()
    assert bk.status == BekanntmachungStatus.WARTET
    assert als(b).post(f"{BASIS}bekanntmachungen/{bk.id}/freigeben/").status_code == 200
    bk.refresh_from_db()
    assert bk.status == BekanntmachungStatus.FREIGEGEBEN


def test_aenderung_am_deutschen_text_macht_uebersetzung_ungeprueft():
    wahl, (a, _b, _c) = neue_wahl("person")
    bk = wahl.bekanntmachungen.first()
    client = als(a)
    client.patch(
        f"{BASIS}bekanntmachungen/{bk.id}/",
        {"sprache": "fr", "betreff": "Appel", "html": "<p>Texte</p>"},
        format="json",
    )
    assert (
        client.post(
            f"{BASIS}bekanntmachungen/{bk.id}/geprueft/",
            {"sprache": "fr", "wert": True},
            format="json",
        ).status_code
        == 200
    )
    antwort = client.patch(
        f"{BASIS}bekanntmachungen/{bk.id}/",
        {"sprache": "de", "html": "<p>Geändert</p>"},
        format="json",
    )
    assert antwort.data["geprueft"]["fr"] is False
    assert "fr" in antwort.data["veraltet"]


def test_aushang_pdf():
    wahl, (a, _b, _c) = neue_wahl("person")
    bk = wahl.bekanntmachungen.first()
    antwort = als(a).get(f"{BASIS}bekanntmachungen/{bk.id}/aushang/?sprache=de")
    assert antwort.status_code == 200 and antwort["Content-Type"] == "application/pdf"
    assert antwort.content.startswith(b"%PDF")
    assert Bekanntmachung.objects.filter(pk=bk.pk).exists()
