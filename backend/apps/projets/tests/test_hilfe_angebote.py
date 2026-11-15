"""Tests — „Hilfe gesucht“: Kategorien, Angebote der Mitglieder, formatierte Beschreibung."""

import pytest
from django.core import mail
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.membres.models import StatutMembre
from apps.membres.tests.factories import MembreFactory
from apps.notifications.models import Notification
from apps.projets.models import (
    HilfeAngebot,
    HilfeKategorie,
    ProjetBewerbung,
    ProjetStelle,
    StatutAngebot,
    StatutStelle,
)

pytestmark = pytest.mark.django_db

KATEGORIEN = "projets:projet-hilfe-kategorie-list"
ANGEBOTE = "projets:projet-hilfe-angebot-list"
STELLEN = "projets:projet-stelle-list"


def _user(role, email):
    user = User.objects.create_user(email=email, password="Password123!", role=role, is_active=True)
    return user, MembreFactory(user=user, statut=StatutMembre.ACTIF)


def _client(user=None):
    client = APIClient()
    if user is not None:
        client.force_authenticate(user)
    return client


@pytest.fixture
def leute():
    buero, buero_m = _user(Role.BUREAU_ADMIN, "buero@example.de")
    rh, rh_m = _user(Role.RH, "rh@example.de")
    anna, anna_m = _user(Role.MEMBRE, "anna@example.de")
    ben, ben_m = _user(Role.MEMBRE, "ben@example.de")
    return {
        "buero": buero,
        "buero_m": buero_m,
        "rh": rh,
        "rh_m": rh_m,
        "anna": anna,
        "anna_m": anna_m,
        "ben": ben,
        "ben_m": ben_m,
    }


def test_startkategorien_sind_angelegt():
    assert HilfeKategorie.objects.filter(aktiv=True).count() >= 5


def test_kategorien_lesen_auch_anonym_nur_aktive():
    HilfeKategorie.objects.create(name_de="Alt", aktiv=False)
    antwort = _client().get(reverse(KATEGORIEN))
    assert antwort.status_code == 200
    assert "Alt" not in [k["name_de"] for k in antwort.data]


def test_kategorien_pflegen_nur_mit_genehmigungsrecht(leute):
    daten = {"name_de": "Garten", "name_fr": "Jardin", "reihenfolge": 5}
    assert _client(leute["anna"]).post(reverse(KATEGORIEN), daten, format="json").status_code == 403
    assert _client(leute["rh"]).post(reverse(KATEGORIEN), daten, format="json").status_code == 403
    antwort = _client(leute["buero"]).post(reverse(KATEGORIEN), daten, format="json")
    assert antwort.status_code == 201 and antwort.data["name_fr"] == "Jardin"
    kategorie_id = antwort.data["id"]
    url = reverse("projets:projet-hilfe-kategorie-detail", args=[kategorie_id])
    assert _client(leute["buero"]).patch(url, {"aktiv": False}, format="json").status_code == 200
    # Deaktivierte sieht nur das Büro mit ?alle=1.
    assert kategorie_id not in [
        k["id"] for k in _client(leute["anna"]).get(reverse(KATEGORIEN)).data
    ]
    alle = _client(leute["buero"]).get(reverse(KATEGORIEN), {"alle": "1"}).data
    assert kategorie_id in [k["id"] for k in alle]
    assert _client(leute["buero"]).delete(url).status_code == 204


def test_gesuch_mit_kategorie_und_filter(leute):
    garten = HilfeKategorie.objects.create(name_de="Garten")
    client = _client(leute["buero"])
    mit = client.post(
        reverse(STELLEN),
        {"titel": "Beete", "anzahl": 1, "art": "dauerhaft", "kategorie": str(garten.id)},
        format="json",
    )
    assert mit.status_code == 201
    assert mit.data["kategorie_detail"]["name_de"] == "Garten"
    client.post(
        reverse(STELLEN), {"titel": "Andere", "anzahl": 1, "art": "dauerhaft"}, format="json"
    )
    gefiltert = client.get(reverse(STELLEN), {"kategorie": str(garten.id)}).data
    assert [s["titel"] for s in gefiltert] == ["Beete"]


def test_beschreibung_wird_als_formatierter_text_bereinigt(leute):
    antwort = _client(leute["buero"]).post(
        reverse(STELLEN),
        {
            "titel": "Aufbau",
            "anzahl": 1,
            "art": "dauerhaft",
            "beschreibung": "<p>Hilfe <strong>gern</strong></p><script>alert(1)</script>",
        },
        format="json",
    )
    assert antwort.status_code == 201
    assert "<strong>gern</strong>" in antwort.data["beschreibung"]
    assert "script" not in antwort.data["beschreibung"]


def test_zu_lange_beschreibung_wird_abgelehnt(leute):
    antwort = _client(leute["buero"]).post(
        reverse(STELLEN),
        {
            "titel": "Lang",
            "anzahl": 1,
            "art": "dauerhaft",
            "beschreibung": "<p>" + "a" * 2100 + "</p>",
        },
        format="json",
    )
    assert antwort.status_code == 400
    assert "beschreibung" in antwort.data["details"]


def test_mitglied_bietet_hilfe_an_und_buero_wird_benachrichtigt(leute):
    kategorie = HilfeKategorie.objects.filter(aktiv=True).first()
    antwort = _client(leute["anna"]).post(
        reverse(ANGEBOTE),
        {
            "titel": "Ich helfe gern bei Festen",
            "kategorie": str(kategorie.id),
            "beschreibung": "<p>Kann <em>backen</em></p>",
            "verfuegbarkeit": "Samstags",
        },
        format="json",
    )
    assert antwort.status_code == 201
    assert antwort.data["status"] == "offen" and antwort.data["ist_meins"] is True
    assert Notification.objects.filter(destinataire=leute["buero"]).exists()
    assert not Notification.objects.filter(destinataire=leute["anna"]).exists()


def test_angebot_braucht_anmeldung_und_aktives_mitglied(leute):
    daten = {"titel": "Hilfe"}
    assert _client().post(reverse(ANGEBOTE), daten, format="json").status_code in (401, 403)
    leute["anna_m"].statut = StatutMembre.EN_ATTENTE
    leute["anna_m"].save()
    assert _client(leute["anna"]).post(reverse(ANGEBOTE), daten, format="json").status_code == 403


def test_angebote_sieht_man_nur_eigene_das_buero_alle(leute):
    for user, titel in ((leute["anna"], "A"), (leute["ben"], "B")):
        _client(user).post(reverse(ANGEBOTE), {"titel": titel}, format="json")
    assert [a["titel"] for a in _client(leute["anna"]).get(reverse(ANGEBOTE)).data] == ["A"]
    assert len(_client(leute["buero"]).get(reverse(ANGEBOTE)).data) == 2
    assert len(_client(leute["rh"]).get(reverse(ANGEBOTE)).data) == 0


def _angebot(leute, titel="Hilfe bei Festen"):
    return (
        _client(leute["anna"]).post(reverse(ANGEBOTE), {"titel": titel}, format="json").data["id"]
    )


def test_buero_nimmt_angebot_an_mit_mail_und_glocke(leute):
    angebot_id = _angebot(leute)
    url = reverse("projets:projet-hilfe-angebot-annehmen", args=[angebot_id])
    assert _client(leute["rh"]).post(url).status_code == 403
    antwort = _client(leute["buero"]).post(url, {"notiz": "Wir melden uns"}, format="json")
    assert antwort.status_code == 200 and antwort.data["status"] == "angenommen"
    assert any("angenommen" in m.subject for m in mail.outbox)
    assert Notification.objects.filter(destinataire=leute["anna"]).exists()
    # Zweite Entscheidung ist nicht mehr möglich.
    assert _client(leute["buero"]).post(url).status_code == 400


def test_buero_lehnt_ab(leute):
    angebot_id = _angebot(leute)
    url = reverse("projets:projet-hilfe-angebot-ablehnen", args=[angebot_id])
    antwort = _client(leute["buero"]).post(url, {"notiz": "Zurzeit nichts frei"}, format="json")
    assert antwort.status_code == 200 and antwort.data["status"] == "abgelehnt"
    assert antwort.data["notiz"] == "Zurzeit nichts frei"


def test_annehmen_mit_zuordnung_bucht_auf_ein_offenes_gesuch(leute):
    gesuch = (
        _client(leute["buero"])
        .post(reverse(STELLEN), {"titel": "Stand", "anzahl": 1, "art": "dauerhaft"}, format="json")
        .data["id"]
    )
    angebot_id = _angebot(leute)
    url = reverse("projets:projet-hilfe-angebot-annehmen", args=[angebot_id])
    antwort = _client(leute["buero"]).post(url, {"stelle": gesuch}, format="json")
    assert antwort.status_code == 200 and antwort.data["stelle_titel"] == "Stand"
    assert ProjetBewerbung.objects.filter(
        stelle_id=gesuch, membre=leute["anna_m"], status="angenommen"
    ).exists()
    assert ProjetStelle.objects.get(pk=gesuch).status == StatutStelle.BESETZT


def test_zuordnung_zu_unbekanntem_oder_geschlossenem_gesuch_scheitert(leute):
    angebot_id = _angebot(leute)
    url = reverse("projets:projet-hilfe-angebot-annehmen", args=[angebot_id])
    assert (
        _client(leute["buero"]).post(url, {"stelle": "nicht-vorhanden"}, format="json").status_code
        == 400
    )
    zu = ProjetStelle.objects.create(titel="Zu", status=StatutStelle.GESCHLOSSEN)
    assert (
        _client(leute["buero"]).post(url, {"stelle": str(zu.id)}, format="json").status_code == 400
    )
    assert HilfeAngebot.objects.get(pk=angebot_id).status == StatutAngebot.OFFEN


def test_mitglied_zieht_eigenes_angebot_zurueck(leute):
    angebot_id = _angebot(leute)
    url = reverse("projets:projet-hilfe-angebot-zurueckziehen", args=[angebot_id])
    assert _client(leute["ben"]).post(url).status_code == 404
    antwort = _client(leute["anna"]).post(url)
    assert antwort.status_code == 200 and antwort.data["status"] == "zurueckgezogen"
    assert _client(leute["anna"]).post(url).status_code == 400
