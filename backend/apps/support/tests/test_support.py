"""Support (Release 33) : FAQ, Tickets, Rechte und Benachrichtigungen."""

import pytest
from django.core import mail
from rest_framework.test import APIClient

from apps.accounts.models import Role
from apps.membres.tests.factories import MembreFactory
from apps.notifications.models import Notification, TypeNotification
from apps.notifications.telegram import kategorie_von
from apps.rbac.registry import API_PREFIXES_MENU, VISIBILITE_NON_MEMBRE_DEFAUT
from apps.rbac.tests.factories import UserFactory
from apps.support import services
from apps.support.models import FaqEintrag, Ticket

pytestmark = pytest.mark.django_db

BASIS = "/api/v1/support/"


def _client(user=None):
    c = APIClient()
    if user is not None:
        c.force_authenticate(user)
    return c


@pytest.fixture
def buero():
    return UserFactory(role=Role.BUREAU_ADMIN)


@pytest.fixture
def mitglied():
    user = UserFactory()
    MembreFactory(user=user, prenom="Mia", nom="Muster")
    user.refresh_from_db()
    return user


def _ticket(user, **kw):
    antwort = _client(user).post(
        BASIS + "tickets/",
        {"betreff": "Hilfe", "kategorie": "konto", "text": "Ich komme nicht rein.", **kw},
        format="json",
    )
    assert antwort.status_code == 201, antwort.content
    return antwort.json()


# --- Verdrahtung -----------------------------------------------------------------------------


def test_support_ist_im_menue_fuer_fans_und_api_geregelt():
    assert "support" in VISIBILITE_NON_MEMBRE_DEFAUT
    assert ("/api/v1/support/", "support") in API_PREFIXES_MENU


def test_support_typen_haben_eine_telegram_kategorie():
    for typ in (
        TypeNotification.SUPPORT_TICKET_NEU,
        TypeNotification.SUPPORT_ANTWORT,
        TypeNotification.SUPPORT_STATUS,
    ):
        assert kategorie_von(typ) == "support"


def test_rechte_nach_rolle(buero, mitglied):
    assert services.darf_verwalten(buero)
    assert services.darf_verwalten(UserFactory(role=Role.SUPER_ADMIN))
    assert not services.darf_verwalten(mitglied)
    assert not services.darf_verwalten(UserFactory(role=Role.RH))


def test_startinhalte_der_faq_sind_da():
    assert FaqEintrag.objects.filter(aktiv=True).count() >= 8
    assert FaqEintrag.objects.filter(aktiv=False, frage_de__contains="Telegram").exists()


# --- FAQ -------------------------------------------------------------------------------------


def test_faq_lesen_zeigt_nur_aktive(mitglied):
    antwort = _client(mitglied).get(BASIS + "faq/")
    assert antwort.status_code == 200
    fragen = [f["frage_de"] for f in antwort.json()]
    assert fragen and not any("Telegram" in f for f in fragen)


def test_faq_ohne_anmeldung_verweigert():
    assert _client().get(BASIS + "faq/").status_code in (401, 403)


def test_faq_pflegen_nur_buero(buero, mitglied):
    neu = {"frage_de": "Frage?", "antwort_de": "Antwort.", "kategorie": "technik"}
    assert _client(mitglied).post(BASIS + "faq/", neu, format="json").status_code == 403
    antwort = _client(buero).post(BASIS + "faq/", neu, format="json")
    assert antwort.status_code == 201
    pk = antwort.json()["id"]
    patch = _client(buero).patch(
        f"{BASIS}faq/{pk}/", {"frage_fr": "Question ?", "aktiv": False}, format="json"
    )
    assert patch.status_code == 200 and patch.json()["aktiv"] is False
    sichtbar = [f["id"] for f in _client(mitglied).get(BASIS + "faq/").json()]
    assert pk not in sichtbar
    alle = [f["id"] for f in _client(buero).get(BASIS + "faq/verwaltung/").json()]
    assert pk in alle
    assert _client(mitglied).get(BASIS + "faq/verwaltung/").status_code == 403
    assert _client(mitglied).delete(f"{BASIS}faq/{pk}/").status_code == 403
    assert _client(buero).delete(f"{BASIS}faq/{pk}/").status_code == 204


def test_faq_validierung(buero):
    c = _client(buero)
    assert (
        c.post(BASIS + "faq/", {"frage_de": "", "antwort_de": "x"}, format="json").status_code
        == 400
    )
    ungueltig = {"frage_de": "a", "antwort_de": "b", "kategorie": "gibtsnicht"}
    assert c.post(BASIS + "faq/", ungueltig, format="json").status_code == 400


# --- Tickets ---------------------------------------------------------------------------------


def test_ticket_eroeffnen_benachrichtigt_das_buero(buero, mitglied):
    daten = _ticket(mitglied)
    assert daten["status"] == "offen"
    assert len(daten["nachrichten"]) == 1
    ticket = Ticket.objects.get(pk=daten["id"])
    assert ticket.name == "Mia Muster"
    meldung = Notification.objects.get(destinataire=buero)
    assert meldung.type_notification == TypeNotification.SUPPORT_TICKET_NEU
    assert f"#{ticket.pk}" in meldung.titre
    assert "Ich komme nicht rein" not in meldung.message
    assert any(buero.email in m.to for m in mail.outbox)
    assert all("Ich komme nicht rein" not in m.body for m in mail.outbox)


def test_ticket_validierung(mitglied):
    c = _client(mitglied)
    assert (
        c.post(BASIS + "tickets/", {"betreff": "", "text": "x"}, format="json").status_code == 400
    )
    assert (
        c.post(BASIS + "tickets/", {"betreff": "x", "text": " "}, format="json").status_code == 400
    )
    falsch = {"betreff": "x", "text": "y", "kategorie": "nix"}
    assert c.post(BASIS + "tickets/", falsch, format="json").status_code == 400
    lang = {"betreff": "x" * 151, "text": "y"}
    assert c.post(BASIS + "tickets/", lang, format="json").status_code == 400


def test_ticket_begrenzung_pro_stunde(mitglied):
    for _ in range(services.MAX_TICKETS_PRO_STUNDE):
        _ticket(mitglied)
    antwort = _client(mitglied).post(
        BASIS + "tickets/", {"betreff": "x", "text": "y"}, format="json"
    )
    assert antwort.status_code == 429


def test_eigene_liste_und_fremdes_ticket_gesperrt(mitglied):
    daten = _ticket(mitglied)
    fremd = UserFactory()
    assert [t["id"] for t in _client(mitglied).get(BASIS + "tickets/").json()] == [daten["id"]]
    assert _client(fremd).get(BASIS + "tickets/").json() == []
    assert _client(fremd).get(f"{BASIS}tickets/{daten['id']}/").status_code == 403
    antwort = _client(fremd).post(
        f"{BASIS}tickets/{daten['id']}/nachrichten/", {"text": "hallo"}, format="json"
    )
    assert antwort.status_code == 403
    assert (
        _client(fremd)
        .patch(f"{BASIS}tickets/{daten['id']}/", {"status": "geschlossen"}, format="json")
        .status_code
        == 403
    )


def test_buero_sieht_alle_und_filtert(buero, mitglied):
    a = _ticket(mitglied, betreff="Passwort")
    b = _ticket(mitglied, betreff="Zahlung")
    Ticket.objects.filter(pk=b["id"]).update(status="geloest")
    c = _client(buero)
    alle = c.get(BASIS + "tickets/?alle=1").json()
    assert {t["id"] for t in alle} == {a["id"], b["id"]}
    assert alle[0]["name"] == "Mia Muster" and alle[0]["art"] == "mitglied"
    aktiv = c.get(BASIS + "tickets/?alle=1&status=aktiv").json()
    assert [t["id"] for t in aktiv] == [a["id"]]
    suche = c.get(BASIS + "tickets/?alle=1&q=zahl").json()
    assert [t["id"] for t in suche] == [b["id"]]
    nummer = c.get(f"{BASIS}tickets/?alle=1&q=%23{a['id']}").json()
    assert [t["id"] for t in nummer] == [a["id"]]
    # Ohne Büro-Recht liefert ?alle=1 nur die eigenen Tickets.
    assert len(_client(mitglied).get(BASIS + "tickets/?alle=1").json()) == 2
    assert "name" not in _client(mitglied).get(BASIS + "tickets/?alle=1").json()[0]


def test_antwort_des_buero_setzt_status_und_benachrichtigt(buero, mitglied):
    daten = _ticket(mitglied)
    antwort = _client(buero).post(
        f"{BASIS}tickets/{daten['id']}/nachrichten/",
        {"text": "Bitte Code neu anfordern."},
        format="json",
    )
    assert antwort.status_code == 201
    ticket = Ticket.objects.get(pk=daten["id"])
    assert ticket.status == "wartet_auf_antwort"
    assert ticket.bearbeiter == buero
    meldung = Notification.objects.get(destinataire=mitglied)
    assert meldung.type_notification == TypeNotification.SUPPORT_ANTWORT
    assert "Code neu" not in meldung.message
    gesehen = _client(mitglied).get(f"{BASIS}tickets/{daten['id']}/").json()
    assert [n["von_support"] for n in gesehen["nachrichten"]] == [False, True]


def test_interne_notiz_bleibt_im_buero(buero, mitglied):
    daten = _ticket(mitglied)
    Notification.objects.all().delete()
    antwort = _client(buero).post(
        f"{BASIS}tickets/{daten['id']}/nachrichten/",
        {"text": "Intern: bitte Zahlung prüfen", "intern": True},
        format="json",
    )
    assert antwort.status_code == 201
    assert Ticket.objects.get(pk=daten["id"]).status == "offen"
    assert not Notification.objects.filter(destinataire=mitglied).exists()
    person = _client(mitglied).get(f"{BASIS}tickets/{daten['id']}/").json()
    assert len(person["nachrichten"]) == 1
    intern = _client(buero).get(f"{BASIS}tickets/{daten['id']}/").json()
    assert len(intern["nachrichten"]) == 2


def test_person_kann_intern_nicht_selbst_setzen(mitglied):
    daten = _ticket(mitglied)
    _client(mitglied).post(
        f"{BASIS}tickets/{daten['id']}/nachrichten/",
        {"text": "Noch was", "intern": True},
        format="json",
    )
    nachricht = Ticket.objects.get(pk=daten["id"]).nachrichten.last()
    assert nachricht.intern is False and nachricht.von_support is False


def test_antwort_der_person_oeffnet_wieder_und_meldet_dem_bearbeiter(buero, mitglied):
    zweites_buero = UserFactory(role=Role.BUREAU_ADMIN)
    daten = _ticket(mitglied)
    _client(buero).post(
        f"{BASIS}tickets/{daten['id']}/nachrichten/", {"text": "Frage"}, format="json"
    )
    Notification.objects.all().delete()
    _client(mitglied).post(
        f"{BASIS}tickets/{daten['id']}/nachrichten/", {"text": "Antwort"}, format="json"
    )
    assert Ticket.objects.get(pk=daten["id"]).status == "offen"
    assert Notification.objects.filter(destinataire=buero).count() == 1
    assert not Notification.objects.filter(destinataire=zweites_buero).exists()


def test_status_aendern_und_bearbeiter_zuweisen(buero, mitglied):
    daten = _ticket(mitglied)
    Notification.objects.all().delete()
    c = _client(buero)
    antwort = c.patch(
        f"{BASIS}tickets/{daten['id']}/",
        {"status": "in_bearbeitung", "bearbeiter": str(buero.pk)},
        format="json",
    )
    assert antwort.status_code == 200
    assert antwort.json()["bearbeiter"]["id"] == str(buero.pk)
    assert not Notification.objects.filter(destinataire=mitglied).exists()
    c.patch(f"{BASIS}tickets/{daten['id']}/", {"status": "geloest"}, format="json")
    ticket = Ticket.objects.get(pk=daten["id"])
    assert ticket.geschlossen_am is not None
    meldung = Notification.objects.get(destinataire=mitglied)
    assert meldung.type_notification == TypeNotification.SUPPORT_STATUS
    c.patch(f"{BASIS}tickets/{daten['id']}/", {"bearbeiter": None}, format="json")
    assert Ticket.objects.get(pk=daten["id"]).bearbeiter is None
    assert (
        c.patch(f"{BASIS}tickets/{daten['id']}/", {"status": "quatsch"}, format="json").status_code
        == 400
    )


def test_bearbeiter_muss_buero_sein(buero, mitglied):
    daten = _ticket(mitglied)
    antwort = _client(buero).patch(
        f"{BASIS}tickets/{daten['id']}/", {"bearbeiter": str(mitglied.pk)}, format="json"
    )
    assert antwort.status_code == 400


def test_person_kann_nur_schliessen_und_dann_nicht_mehr_antworten(mitglied):
    daten = _ticket(mitglied)
    c = _client(mitglied)
    assert (
        c.patch(f"{BASIS}tickets/{daten['id']}/", {"status": "geloest"}, format="json").status_code
        == 400
    )
    assert (
        c.patch(
            f"{BASIS}tickets/{daten['id']}/", {"status": "geschlossen"}, format="json"
        ).status_code
        == 200
    )
    detail = c.get(f"{BASIS}tickets/{daten['id']}/").json()
    assert detail["kann_antworten"] is False
    antwort = c.post(f"{BASIS}tickets/{daten['id']}/nachrichten/", {"text": "noch"}, format="json")
    assert antwort.status_code == 400


def test_buero_kann_geschlossenes_ticket_wieder_oeffnen(buero, mitglied):
    daten = _ticket(mitglied)
    _client(mitglied).patch(
        f"{BASIS}tickets/{daten['id']}/", {"status": "geschlossen"}, format="json"
    )
    antwort = _client(buero).patch(
        f"{BASIS}tickets/{daten['id']}/", {"status": "offen"}, format="json"
    )
    assert antwort.status_code == 200
    assert Ticket.objects.get(pk=daten["id"]).geschlossen_am is None


def test_buero_antwort_mit_status_geloest(buero, mitglied):
    daten = _ticket(mitglied)
    _client(buero).post(
        f"{BASIS}tickets/{daten['id']}/nachrichten/",
        {"text": "Erledigt.", "status": "geloest"},
        format="json",
    )
    assert Ticket.objects.get(pk=daten["id"]).status == "geloest"


def test_ticket_ueberlebt_kontoloeschung(buero, mitglied):
    daten = _ticket(mitglied)
    mitglied.delete()
    ticket = Ticket.objects.get(pk=daten["id"])
    assert ticket.user is None and ticket.name == "Mia Muster"
    detail = _client(buero).get(f"{BASIS}tickets/{daten['id']}/")
    assert detail.status_code == 200
    antwort = _client(buero).post(
        f"{BASIS}tickets/{daten['id']}/nachrichten/", {"text": "Hallo"}, format="json"
    )
    assert antwort.status_code == 201


def test_fan_darf_ticket_eroeffnen(buero):
    fan = UserFactory()
    daten = _ticket(fan)
    assert _client(buero).get(f"{BASIS}tickets/{daten['id']}/").json()["art"] in ("fan", "konto")
