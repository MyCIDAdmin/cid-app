"""Tests — „Hilfe gesucht“: freie Gesuche ohne Projekt, Empfehlung und Genehmigung."""

from datetime import timedelta

import pytest
from django.core import mail
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.membres.models import Faehigkeit, MembreFaehigkeit, StatutMembre
from apps.membres.tests.factories import MembreFactory
from apps.notifications.models import Notification, TypeNotification
from apps.projets.hilfe import schliesse_abgelaufene
from apps.projets.models import (
    ProjetBewerbung,
    ProjetMitglied,
    ProjetStelle,
    SichtbarkeitStelle,
    StatutBewerbung,
    StatutStelle,
)
from apps.rbac.models import NiveauAcces, RoleModulePermission
from apps.rbac.tests.factories import RoleDefinitionFactory, UserRoleAssignmentFactory

pytestmark = pytest.mark.django_db

LISTE = "projets:projet-stelle-list"


def _user(role=Role.MEMBRE, email="u@example.de"):
    user = User.objects.create_user(email=email, password="Password123!", role=role, is_active=True)
    return user, MembreFactory(user=user, statut=StatutMembre.ACTIF)


def _client(user=None):
    client = APIClient()
    if user is not None:
        client.force_authenticate(user)
    return client


def _gesuch(client, **extra):
    daten = {"titel": "Helfer·innen für den Stand", "anzahl": 1, "art": "dauerhaft"}
    daten.update(extra)
    return client.post(reverse(LISTE), daten, format="json")


@pytest.fixture
def rollen():
    rh_u, rh_m = _user(Role.RH, "rh@example.de")
    buero_u, buero_m = _user(Role.BUREAU_ADMIN, "buero@example.de")
    mitglied_u, mitglied_m = _user(Role.MEMBRE, "mitglied@example.de")
    return {
        "rh": rh_u,
        "rh_m": rh_m,
        "buero": buero_u,
        "buero_m": buero_m,
        "mitglied": mitglied_u,
        "mitglied_m": mitglied_m,
    }


def test_mitglied_darf_kein_gesuch_veroeffentlichen(rollen):
    antwort = _gesuch(_client(rollen["mitglied"]))
    assert antwort.status_code == 403


def test_rh_veroeffentlicht_freies_gesuch_ohne_projekt(rollen):
    antwort = _gesuch(_client(rollen["rh"]))
    assert antwort.status_code == 201, antwort.data
    assert antwort.data["frei"] is True
    assert antwort.data["projet"] is None
    stelle = ProjetStelle.objects.get(pk=antwort.data["id"])
    assert stelle.created_by_id == rollen["rh_m"].id


def test_einmalige_hilfe_braucht_ein_datum(rollen):
    antwort = _gesuch(_client(rollen["rh"]), art="einmalig")
    assert antwort.status_code == 400
    assert "termin" in antwort.data["details"]


def test_dauerhaft_verwirft_ein_datum(rollen):
    antwort = _gesuch(_client(rollen["rh"]), art="dauerhaft", termin="2027-01-01")
    assert antwort.status_code == 201
    assert antwort.data["termin"] is None


def test_frist_nicht_nach_dem_termin(rollen):
    antwort = _gesuch(
        _client(rollen["rh"]), art="einmalig", termin="2027-03-01", frist="2027-03-05"
    )
    assert antwort.status_code == 400


def test_zusaetzliche_rolle_mit_der_seite_darf_veroeffentlichen(rollen):
    user = rollen["mitglied"]
    assert _gesuch(_client(user)).status_code == 403
    rolle = RoleDefinitionFactory()
    RoleModulePermission.objects.create(
        role=rolle,
        module="page_hilfe_veroeffentlichen",
        niveau_acces=NiveauAcces.LECTURE_ECRITURE,
    )
    UserRoleAssignmentFactory(user=user, role=rolle)
    assert _gesuch(_client(user)).status_code == 201


def test_sichtbarkeit_oeffentlich_und_nur_mitglieder(rollen):
    ProjetStelle.objects.create(
        titel="Öffentlich", sichtbarkeit=SichtbarkeitStelle.OEFFENTLICH, anzahl=1
    )
    ProjetStelle.objects.create(
        titel="Nur Mitglieder", sichtbarkeit=SichtbarkeitStelle.MITGLIEDER, anzahl=1
    )
    anonym = _client().get(reverse(LISTE), {"frei": "1"})
    assert [s["titel"] for s in anonym.data] == ["Öffentlich"]
    angemeldet = _client(rollen["mitglied"]).get(reverse(LISTE), {"frei": "1"})
    assert {s["titel"] for s in angemeldet.data} == {"Öffentlich", "Nur Mitglieder"}


def test_geschlossene_gesuche_nur_fuer_ersteller_und_genehmiger(rollen):
    stelle = ProjetStelle.objects.create(
        titel="Zu", status=StatutStelle.GESCHLOSSEN, created_by=rollen["rh_m"], anzahl=1
    )
    fremd = _client(rollen["mitglied"]).get(reverse(LISTE), {"frei": "1"})
    assert fremd.data == []
    for user in (rollen["rh"], rollen["buero"]):
        antwort = _client(user).get(reverse(LISTE), {"frei": "1"})
        assert [s["id"] for s in antwort.data] == [str(stelle.id)]


def _ablauf_vorbereiten(rollen):
    stelle = ProjetStelle.objects.create(
        titel="Stand", anzahl=1, created_by=rollen["rh_m"], sichtbarkeit="mitglieder"
    )
    antwort = _client(rollen["mitglied"]).post(
        reverse("projets:projet-stelle-bewerben", args=[stelle.id]),
        {"nachricht": "Ich komme"},
        format="json",
    )
    assert antwort.status_code == 201, antwort.data
    return stelle, ProjetBewerbung.objects.get(stelle=stelle)


def test_empfehlen_und_genehmigen_ablauf(rollen):
    stelle, bewerbung = _ablauf_vorbereiten(rollen)
    # Die Ersteller·in wird über die neue Meldung benachrichtigt.
    assert Notification.objects.filter(
        destinataire=rollen["rh"], type_notification=TypeNotification.PROJEKT_BEWERBUNG
    ).exists()

    # Verbindlich entscheiden darf die Ersteller·in (RH) nicht ...
    assert (
        _client(rollen["rh"])
        .post(reverse("projets:projet-bewerbung-annehmen", args=[bewerbung.id]))
        .status_code
        == 403
    )
    # ... aber empfehlen.
    antwort = _client(rollen["rh"]).post(
        reverse("projets:projet-bewerbung-empfehlen", args=[bewerbung.id])
    )
    assert antwort.status_code == 200
    bewerbung.refresh_from_db()
    assert bewerbung.status == StatutBewerbung.EMPFOHLEN
    assert bewerbung.empfohlen_von_id == rollen["rh_m"].id
    # Das Büro bekommt den Hinweis „zu genehmigen“.
    assert Notification.objects.filter(
        destinataire=rollen["buero"], titre__startswith="À approuver"
    ).exists()

    # Das Büro genehmigt: verbindlich, kein automatisches Projektteam.
    antwort = _client(rollen["buero"]).post(
        reverse("projets:projet-bewerbung-annehmen", args=[bewerbung.id])
    )
    assert antwort.status_code == 200
    bewerbung.refresh_from_db()
    stelle.refresh_from_db()
    assert bewerbung.status == StatutBewerbung.ANGENOMMEN
    assert stelle.status == StatutStelle.BESETZT
    assert not ProjetMitglied.objects.filter(membre=rollen["mitglied_m"]).exists()
    # Glocke + E-Mail an die Person.
    assert Notification.objects.filter(
        destinataire=rollen["mitglied"],
        type_notification=TypeNotification.PROJEKT_BEWERBUNG_ENTSCHIEDEN,
    ).exists()
    assert len(mail.outbox) == 1
    assert "Chat" in mail.outbox[0].body


def test_buero_kann_ohne_empfehlung_direkt_genehmigen(rollen):
    _stelle, bewerbung = _ablauf_vorbereiten(rollen)
    antwort = _client(rollen["buero"]).post(
        reverse("projets:projet-bewerbung-annehmen", args=[bewerbung.id])
    )
    assert antwort.status_code == 200


def test_ablehnen_schickt_absage_und_laesst_gesuch_offen(rollen):
    stelle, bewerbung = _ablauf_vorbereiten(rollen)
    antwort = _client(rollen["buero"]).post(
        reverse("projets:projet-bewerbung-ablehnen", args=[bewerbung.id])
    )
    assert antwort.status_code == 200
    stelle.refresh_from_db()
    assert stelle.status == StatutStelle.OFFEN


def test_bewerberin_kann_nicht_empfehlen_oder_genehmigen(rollen):
    _stelle, bewerbung = _ablauf_vorbereiten(rollen)
    client = _client(rollen["mitglied"])
    assert (
        client.post(reverse("projets:projet-bewerbung-empfehlen", args=[bewerbung.id])).status_code
        == 403
    )
    assert (
        client.post(reverse("projets:projet-bewerbung-annehmen", args=[bewerbung.id])).status_code
        == 403
    )


def test_fremde_rh_sieht_die_meldungen_nicht(rollen):
    _stelle, bewerbung = _ablauf_vorbereiten(rollen)
    fremd_u, _fremd_m = _user(Role.RH, "rh2@example.de")
    antwort = _client(fremd_u).post(
        reverse("projets:projet-bewerbung-empfehlen", args=[bewerbung.id])
    )
    assert antwort.status_code == 404


def test_eigenes_gesuch_nicht_selbst_bedienen(rollen):
    stelle = ProjetStelle.objects.create(titel="Eigen", anzahl=1, created_by=rollen["rh_m"])
    antwort = _client(rollen["rh"]).post(
        reverse("projets:projet-stelle-bewerben", args=[stelle.id]), {}, format="json"
    )
    assert antwort.status_code == 400


def test_abgelaufene_frist_sperrt_meldungen_und_schliesst_nachts(rollen):
    gestern = timezone.localdate() - timedelta(days=1)
    stelle = ProjetStelle.objects.create(
        titel="Alt", anzahl=1, created_by=rollen["rh_m"], frist=gestern
    )
    antwort = _client(rollen["mitglied"]).post(
        reverse("projets:projet-stelle-bewerben", args=[stelle.id]), {}, format="json"
    )
    assert antwort.status_code == 400
    assert schliesse_abgelaufene() == 1
    stelle.refresh_from_db()
    assert stelle.status == StatutStelle.GESCHLOSSEN


def test_einmalige_hilfe_schliesst_nach_dem_termin_ohne_frist(rollen):
    gestern = timezone.localdate() - timedelta(days=1)
    stelle = ProjetStelle.objects.create(
        titel="Vorbei", anzahl=1, art="einmalig", termin=gestern, created_by=rollen["rh_m"]
    )
    dauer = ProjetStelle.objects.create(titel="Dauer", anzahl=1, created_by=rollen["rh_m"])
    assert schliesse_abgelaufene() == 1
    stelle.refresh_from_db()
    dauer.refresh_from_db()
    assert stelle.status == StatutStelle.GESCHLOSSEN
    assert dauer.status == StatutStelle.OFFEN


def test_projektstellen_bleiben_von_der_automatik_unberuehrt():
    from apps.projets.tests.factories import ProjetFactory

    gestern = timezone.localdate() - timedelta(days=1)
    stelle = ProjetStelle.objects.create(
        projet=ProjetFactory(), titel="Projekt", anzahl=1, frist=gestern
    )
    assert schliesse_abgelaufene() == 0
    stelle.refresh_from_db()
    assert stelle.status == StatutStelle.OFFEN


def test_ersteller_schliesst_eigenes_gesuch_und_fremde_nicht(rollen):
    stelle = ProjetStelle.objects.create(titel="Mein", anzahl=1, created_by=rollen["rh_m"])
    url = reverse("projets:projet-stelle-detail", args=[stelle.id])
    fremd_u, _fremd_m = _user(Role.RH, "rh3@example.de")
    assert _client(fremd_u).patch(url, {"status": "geschlossen"}, format="json").status_code == 403
    assert (
        _client(rollen["rh"]).patch(url, {"status": "geschlossen"}, format="json").status_code
        == 200
    )


def test_passende_mitglieder_fuer_freies_gesuch(rollen):
    web = Faehigkeit.objects.get(bezeichnung="Webdesign")
    MembreFaehigkeit.objects.create(membre=rollen["mitglied_m"], faehigkeit=web, kommentar="Profi")
    stelle = ProjetStelle.objects.create(
        titel="Web", anzahl=1, created_by=rollen["rh_m"], faehigkeit=web
    )
    antwort = _client(rollen["rh"]).get(
        reverse("projets:projet-stelle-passende-mitglieder", args=[stelle.id])
    )
    assert antwort.status_code == 200
    assert [m["id"] for m in antwort.data] == [str(rollen["mitglied_m"].id)]
    # fremde Mitglieder sehen die Vorschläge nicht
    assert (
        _client(rollen["mitglied"])
        .get(reverse("projets:projet-stelle-passende-mitglieder", args=[stelle.id]))
        .status_code
        == 403
    )
