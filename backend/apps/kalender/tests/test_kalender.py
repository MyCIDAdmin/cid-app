"""Tests — Büro- und Vereinskalender (Release 15)."""

from datetime import datetime, timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.communaute.models import Publication
from apps.kalender.models import Antwort, Termin, TerminEinladung, TerminStatus
from apps.kalender.services import vorkommen
from apps.kalender.tasks import termin_erinnerungen
from apps.membres.models import StatutMembre
from apps.membres.tests.factories import MembreFactory
from apps.notifications.models import Notification
from apps.projets.models import ProjetMitglied
from apps.projets.tests.factories import ProjetFactory
from apps.rbac.models import RoleDefinition, RoleModulePermission, UserRoleAssignment

pytestmark = pytest.mark.django_db

EINTRAEGE = "/api/v1/kalender/eintraege/"
TERMINE = "/api/v1/kalender/termine/"
OEFFENTLICH = "/api/v1/kalender-oeffentlich/"


def _user(role=Role.MEMBRE, email="u@example.de", mitglied=True):
    user = User.objects.create_user(email=email, password="Password123!", role=role, is_active=True)
    membre = MembreFactory(user=user, statut=StatutMembre.ACTIF) if mitglied else None
    return user, membre


def _client(user=None):
    c = APIClient()
    if user is not None:
        c.force_authenticate(user)
    return c


def _zeitraum():
    heute = timezone.make_aware(datetime.combine(timezone.localdate(), datetime.min.time()))
    return {"von": heute.isoformat(), "bis": (heute + timedelta(days=60)).isoformat()}


def _termin(user, **extra):
    daten = {
        "titel": "Sitzung",
        "kategorie": "sitzung",
        "beginn": timezone.now() + timedelta(days=2),
        "sichtbarkeit": "kreis",
        "kreis": "bureau",
        "erstellt_von": user,
    }
    daten.update(extra)
    return Termin.objects.create(**daten)


def _titel(antwort):
    return {e["titel"] for e in antwort.data}


def _eintraege(user, ansicht):
    return _client(user).get(EINTRAEGE, {**_zeitraum(), "ansicht": ansicht})


@pytest.fixture
def bureau():
    return _user(Role.BUREAU_ADMIN, "bureau@example.de")[0]


def test_sichtbarkeit_stufen(bureau):
    mitglied, _ = _user(email="m@example.de")
    _termin(bureau, titel="Intern", sichtbarkeit="kreis", kreis="bureau")
    _termin(bureau, titel="Aufgabenträger", sichtbarkeit="aufgabentraeger")
    _termin(bureau, titel="Fest", sichtbarkeit="mitglieder", kategorie="vereinsdatum")
    _termin(bureau, titel="Offen", sichtbarkeit="oeffentlich")
    assert _titel(_eintraege(mitglied, "verein")) == {"Fest", "Offen"}
    assert _eintraege(mitglied, "buero").status_code == 403
    assert _titel(_eintraege(bureau, "buero")) == {"Intern", "Aufgabenträger", "Fest", "Offen"}


def test_projektteam_sieht_projektkreis_und_aufgabentraeger(bureau):
    mitglied, membre = _user(email="p@example.de")
    projekt = ProjetFactory()
    ProjetMitglied.objects.create(projet=projekt, membre=membre)
    fremd = ProjetFactory()
    _termin(bureau, titel="Team", sichtbarkeit="kreis", kreis="projekt", projekt=projekt)
    _termin(bureau, titel="Fremd", sichtbarkeit="kreis", kreis="projekt", projekt=fremd)
    _termin(bureau, titel="Bureau", sichtbarkeit="kreis", kreis="bureau")
    _termin(bureau, titel="Alle Träger", sichtbarkeit="aufgabentraeger")
    assert _titel(_eintraege(mitglied, "buero")) == {"Team", "Alle Träger"}
    assert _titel(_eintraege(mitglied, "meine")) == {"Team"}


def test_nicht_mitglied_sieht_nur_oeffentliches(bureau):
    fremd, _ = _user(email="f@example.de", mitglied=False)
    _termin(bureau, titel="Fest", sichtbarkeit="mitglieder")
    _termin(bureau, titel="Offen", sichtbarkeit="oeffentlich")
    assert _titel(_eintraege(fremd, "verein")) == {"Offen"}


def test_einladung_macht_zum_aufgabentraeger(bureau):
    mitglied, _ = _user(email="e@example.de")
    assert _eintraege(mitglied, "buero").status_code == 403
    antwort = _client(bureau).post(
        TERMINE,
        {
            "titel": "Treffen",
            "kategorie": "sitzung",
            "beginn": (timezone.now() + timedelta(days=1)).isoformat(),
            "sichtbarkeit": "kreis",
            "kreis": "bureau",
            "einladen": [str(mitglied.pk)],
        },
        format="json",
    )
    assert antwort.status_code == 201, antwort.data
    assert Notification.objects.filter(destinataire=mitglied).count() == 1
    assert "Treffen" in _titel(_eintraege(mitglied, "buero"))
    assert "Treffen" in _titel(_eintraege(mitglied, "meine"))


def test_anlegen_nur_mit_schreibrecht():
    mitglied, _ = _user()
    daten = {
        "titel": "X",
        "kategorie": "sonstiges",
        "beginn": timezone.now().isoformat(),
        "sichtbarkeit": "mitglieder",
    }
    assert _client(mitglied).post(TERMINE, daten, format="json").status_code == 403
    assert _client().post(TERMINE, daten, format="json").status_code == 401


def test_validierung_kreis_und_ende(bureau):
    c = _client(bureau)
    basis = {"titel": "X", "kategorie": "sitzung", "beginn": timezone.now().isoformat()}
    assert c.post(TERMINE, {**basis, "sichtbarkeit": "kreis"}, format="json").status_code == 400
    assert (
        c.post(
            TERMINE, {**basis, "sichtbarkeit": "kreis", "kreis": "projekt"}, format="json"
        ).status_code
        == 400
    )
    ende = (timezone.now() - timedelta(days=1)).isoformat()
    antwort = c.post(TERMINE, {**basis, "sichtbarkeit": "mitglieder", "ende": ende}, format="json")
    assert antwort.status_code == 400


def test_vorschlag_nur_mit_berechtigung_und_freigabe(bureau):
    vorschlager, _ = _user(email="v@example.de")
    leser, _ = _user(email="l@example.de")
    rolle = RoleDefinition.objects.create(slug="termin_vorschlag", nom="Termin-Vorschlag")
    RoleModulePermission.objects.create(
        role=rolle, module="page_kalender_vorschlag", niveau_acces="lecture_ecriture"
    )
    UserRoleAssignment.objects.create(user=vorschlager, role=rolle)
    daten = {
        "titel": "Grillen",
        "kategorie": "veranstaltung",
        "beginn": (timezone.now() + timedelta(days=5)).isoformat(),
        "sichtbarkeit": "mitglieder",
    }
    assert _client(leser).post(TERMINE + "vorschlagen/", daten, format="json").status_code == 403
    antwort = _client(vorschlager).post(TERMINE + "vorschlagen/", daten, format="json")
    assert antwort.status_code == 201, antwort.data
    assert antwort.data["status"] == "vorgeschlagen"
    termin_id = antwort.data["id"]
    assert Notification.objects.filter(destinataire=bureau).exists()
    # Vorschlag ist weder im Vereinskalender noch für Fremde sichtbar
    assert "Grillen" not in _titel(_eintraege(leser, "verein"))
    assert "Grillen" in _titel(_eintraege(bureau, "buero"))
    # Vorschlagende dürfen selbst nicht freigeben
    assert _client(vorschlager).post(f"{TERMINE}{termin_id}/freigeben/").status_code == 403
    assert _client(bureau).post(f"{TERMINE}{termin_id}/freigeben/").status_code == 200
    assert "Grillen" in _titel(_eintraege(leser, "verein"))
    assert Notification.objects.filter(destinataire=vorschlager).exists()
    # zweite Entscheidung nicht möglich
    assert _client(bureau).post(f"{TERMINE}{termin_id}/ablehnen/").status_code == 400


def test_abgelehnter_vorschlag_bleibt_unsichtbar(bureau):
    leser, _ = _user(email="l2@example.de")
    t = _termin(bureau, titel="Nein", sichtbarkeit="mitglieder", status=TerminStatus.ABGELEHNT)
    assert not Termin.objects.get(pk=t.pk).status == TerminStatus.FREIGEGEBEN
    assert "Nein" not in _titel(_eintraege(leser, "verein"))


def test_antworten_nur_eingeladene(bureau):
    eingeladen, _ = _user(email="a@example.de")
    anderer, _ = _user(email="b@example.de")
    t = _termin(bureau, sichtbarkeit="mitglieder")
    TerminEinladung.objects.create(termin=t, user=eingeladen)
    assert (
        _client(anderer).post(f"{TERMINE}{t.pk}/antworten/", {"antwort": "zusage"}).status_code
        == 400
    )
    antwort = _client(eingeladen).post(f"{TERMINE}{t.pk}/antworten/", {"antwort": "zusage"})
    assert antwort.status_code == 200
    assert antwort.data["meine_antwort"] == "zusage"
    assert (
        _client(eingeladen).post(f"{TERMINE}{t.pk}/antworten/", {"antwort": "x"}).status_code == 400
    )


def test_wiederholung_woechentlich_und_ende():
    user, _ = _user()
    start = timezone.make_aware(datetime(2026, 11, 2, 18, 0))
    t = Termin(
        titel="Stammtisch",
        beginn=start,
        ende=start + timedelta(hours=2),
        wiederholung="woechentlich",
        wiederholung_bis=datetime(2026, 11, 20).date(),
        erstellt_von=user,
    )
    treffer = vorkommen(t, start - timedelta(days=1), start + timedelta(days=60))
    assert [s.day for s, _ in treffer] == [2, 9, 16]
    assert treffer[1][1] - treffer[1][0] == timedelta(hours=2)
    t.wiederholung, t.wiederholung_bis = "monatlich", None
    treffer = vorkommen(t, start, start + timedelta(days=100))
    assert [(s.month, s.day) for s, _ in treffer] == [(11, 2), (12, 2), (1, 2), (2, 2)]


def test_oeffentliche_seite_ohne_anmeldung(bureau):
    _termin(bureau, titel="Offen", sichtbarkeit="oeffentlich")
    _termin(bureau, titel="Nur Mitglieder", sichtbarkeit="mitglieder")
    _termin(bureau, titel="Intern")
    antwort = _client().get(OEFFENTLICH, _zeitraum())
    assert antwort.status_code == 200
    assert _titel(antwort) == {"Offen"}
    assert "erstellt_von" not in antwort.data[0] and "status" not in antwort.data[0]


def test_feed_aufgaben_und_veranstaltungen():
    from apps.evenements.models import Evenement, StatutEvenement

    user, membre = _user()
    projekt = ProjetFactory()
    from apps.projets.models import Aufgabe

    Aufgabe.objects.create(
        projet=projekt,
        titel="Flyer drucken",
        verantwortlich=membre,
        frist=timezone.localdate() + timedelta(days=3),
    )
    heute = timezone.localdate()
    Evenement.objects.create(
        titre="Grillfest",
        date_evenement=heute + timedelta(days=4),
        statut=StatutEvenement.PUBLIE,
        visible_public=True,
        lieu="Park",
        created_by=membre,
    )
    meine = _eintraege(user, "meine")
    assert "Aufgabe: Flyer drucken" in _titel(meine)
    assert "Grillfest" in _titel(_eintraege(user, "verein"))
    assert "Grillfest" in _titel(_client().get(OEFFENTLICH, _zeitraum()))
    assert "Aufgabe: Flyer drucken" not in _titel(_eintraege(user, "verein"))


def test_ankuendigen_einmalig(bureau):
    t = _termin(bureau, titel="Jahrestag", sichtbarkeit="mitglieder", kategorie="vereinsdatum")
    c = _client(bureau)
    assert c.post(f"{TERMINE}{t.pk}/ankuendigen/").status_code == 200
    assert Publication.objects.filter(important=True, contenu__contains="Jahrestag").count() == 1
    assert c.post(f"{TERMINE}{t.pk}/ankuendigen/").status_code == 400
    intern = _termin(bureau, titel="Intern")
    assert c.post(f"{TERMINE}{intern.pk}/ankuendigen/").status_code == 400


def test_erinnerung_einmal_je_vorkommen(bureau):
    eingeladen, _ = _user(email="r@example.de")
    absager, _ = _user(email="r2@example.de")
    t = _termin(bureau, beginn=timezone.now() + timedelta(hours=20), erinnerung_stunden=24)
    TerminEinladung.objects.create(termin=t, user=eingeladen)
    TerminEinladung.objects.create(termin=t, user=absager, antwort=Antwort.ABSAGE)
    assert termin_erinnerungen() == 1
    assert (
        Notification.objects.filter(destinataire=eingeladen, titre__startswith="Erinnerung").count()
        == 1
    )
    assert not Notification.objects.filter(
        destinataire=absager, titre__startswith="Erinnerung"
    ).exists()
    assert termin_erinnerungen() == 0
    far = _termin(
        bureau, titel="Fern", beginn=timezone.now() + timedelta(days=10), erinnerung_stunden=2
    )
    assert termin_erinnerungen() == 0
    assert Termin.objects.get(pk=far.pk).letzte_erinnerung is None


def test_personensuche_und_zugang(bureau):
    user, membre = _user(email="s@example.de")
    membre.nom = "Zielperson"
    membre.save()
    assert _client(bureau).get(TERMINE + "personen/", {"q": "Zielper"}).data[0]["user"] == str(
        user.pk
    )
    assert _client(user).get(TERMINE + "personen/", {"q": "Ziel"}).status_code == 403
    z = _client(bureau).get("/api/v1/kalender/zugang/").data
    assert z["schreiben"] and z["buero"] and z["verein"]
    z = _client(user).get("/api/v1/kalender/zugang/").data
    assert z == {
        "verein": True,
        "buero": False,
        "schreiben": False,
        "vorschlagen": False,
        "verwaltung": False,
    }


def test_zeitraum_begrenzt(bureau):
    antwort = _client(bureau).get(
        EINTRAEGE, {"von": "2026-01-01", "bis": "2027-01-01", "ansicht": "verein"}
    )
    assert antwort.status_code == 400
