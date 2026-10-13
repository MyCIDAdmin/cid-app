"""Tests — Projekt-Stellen und Meldungen (Release 10)."""

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.membres.models import Faehigkeit, MembreFaehigkeit, StatutMembre
from apps.membres.tests.factories import MembreFactory
from apps.notifications.models import Notification, TypeNotification
from apps.projets.models import (
    ProjetBewerbung,
    ProjetMitglied,
    ProjetStelle,
    RolleProjet,
    SichtbarkeitProjet,
    StatutStelle,
)
from apps.projets.tests.factories import ProjetFactory

pytestmark = pytest.mark.django_db

LISTE = "projets:projet-stelle-list"


def _user(role=Role.MEMBRE, email="u@example.de", statut=StatutMembre.ACTIF):
    user = User.objects.create_user(email=email, password="Password123!", role=role, is_active=True)
    return user, MembreFactory(user=user, statut=statut)


def _client(user=None):
    client = APIClient()
    if user is not None:
        client.force_authenticate(user)
    return client


@pytest.fixture
def szenario():
    leitung_u, leitung_m = _user(email="leitung@example.de")
    projet = ProjetFactory(responsable=leitung_m)
    web = Faehigkeit.objects.get(bezeichnung="Webdesign")
    stelle = ProjetStelle.objects.create(projet=projet, titel="Web Designer", faehigkeit=web)
    return {"leitung": leitung_u, "leitung_m": leitung_m, "projet": projet, "stelle": stelle}


def _bewerben(client, stelle, nachricht="Ich helfe gern"):
    return client.post(
        reverse("projets:projet-stelle-bewerben", args=[stelle.id]),
        {"nachricht": nachricht},
        format="json",
    )


def test_leitung_legt_stelle_an_und_fremde_nicht(szenario):
    daten = {
        "projet": str(szenario["projet"].id),
        "titel": "Logistik-Experte",
        "anzahl": 2,
    }
    resp = _client(szenario["leitung"]).post(reverse(LISTE), daten, format="json")
    assert resp.status_code == 201, resp.data
    fremd, _ = _user(email="fremd@example.de")
    assert _client(fremd).post(reverse(LISTE), daten, format="json").status_code == 403
    assert _client().post(reverse(LISTE), daten, format="json").status_code in (401, 403)


def test_stellen_sind_oeffentlich_lesbar_aber_entwuerfe_und_geschlossene_nicht(szenario):
    anonym = _client().get(reverse(LISTE), {"projet": str(szenario["projet"].id)})
    assert anonym.status_code == 200 and len(anonym.data) == 1
    assert anonym.data[0]["meine_bewerbung"] is None and anonym.data[0]["bewerbungen_offen"] is None
    ProjetStelle.objects.create(
        projet=szenario["projet"], titel="Zu", status=StatutStelle.GESCHLOSSEN
    )
    assert len(_client().get(reverse(LISTE)).data) == 1
    assert len(_client(szenario["leitung"]).get(reverse(LISTE)).data) == 2
    szenario["projet"].sichtbarkeit = SichtbarkeitProjet.ENTWURF
    szenario["projet"].save()
    assert _client().get(reverse(LISTE)).data == []


def test_aktives_mitglied_meldet_sich_und_leitung_wird_benachrichtigt(szenario):
    user, membre = _user(email="helfer@example.de")
    resp = _bewerben(_client(user), szenario["stelle"])
    assert resp.status_code == 201
    assert resp.data["meine_bewerbung"] == "offen"
    assert Notification.objects.filter(
        destinataire=szenario["leitung"], type_notification=TypeNotification.PROJEKT_BEWERBUNG
    ).exists()
    doppelt = _bewerben(_client(user), szenario["stelle"])
    assert doppelt.status_code == 400
    leitung_sicht = _client(szenario["leitung"]).get(reverse(LISTE)).data[0]
    assert leitung_sicht["bewerbungen_offen"] == 1


def test_nicht_aktive_oder_anonyme_koennen_sich_nicht_melden(szenario):
    inaktiv_u, _ = _user(email="inaktiv@example.de", statut=StatutMembre.INACTIF)
    assert _bewerben(_client(inaktiv_u), szenario["stelle"]).status_code == 403
    assert _bewerben(_client(), szenario["stelle"]).status_code in (401, 403)


def test_teammitglied_kann_sich_nicht_auf_eigenes_projekt_melden(szenario):
    user, membre = _user(email="team@example.de")
    ProjetMitglied.objects.create(projet=szenario["projet"], membre=membre)
    assert _bewerben(_client(user), szenario["stelle"]).status_code == 400


def test_zurueckziehen_und_erneut_melden(szenario):
    user, _ = _user(email="zurueck@example.de")
    client = _client(user)
    _bewerben(client, szenario["stelle"])
    resp = client.post(reverse("projets:projet-stelle-zurueckziehen", args=[szenario["stelle"].id]))
    assert resp.status_code == 200 and resp.data["meine_bewerbung"] == "zurueckgezogen"
    assert _bewerben(client, szenario["stelle"]).status_code == 200
    assert ProjetBewerbung.objects.count() == 1


def test_annehmen_macht_zum_teammitglied_und_besetzt_die_stelle(szenario):
    user, membre = _user(email="neu@example.de")
    _bewerben(_client(user), szenario["stelle"])
    bewerbung = ProjetBewerbung.objects.get()
    url = reverse("projets:projet-bewerbung-annehmen", args=[bewerbung.id])
    assert _client(user).post(url).status_code in (403, 404)  # Bewerber entscheidet nicht selbst
    resp = _client(szenario["leitung"]).post(url)
    assert resp.status_code == 200 and resp.data["status"] == "angenommen"
    assert ProjetMitglied.objects.filter(
        projet=szenario["projet"], membre=membre, rolle=RolleProjet.MITARBEIT
    ).exists()
    szenario["stelle"].refresh_from_db()
    assert szenario["stelle"].status == StatutStelle.BESETZT
    assert Notification.objects.filter(
        destinataire=user, type_notification=TypeNotification.PROJEKT_BEWERBUNG_ENTSCHIEDEN
    ).exists()
    assert _client(szenario["leitung"]).post(url).status_code == 400  # schon bearbeitet


def test_stelle_mit_mehreren_plaetzen_bleibt_offen_bis_voll(szenario):
    szenario["stelle"].anzahl = 2
    szenario["stelle"].save()
    for i in range(2):
        user, _ = _user(email=f"h{i}@example.de")
        _bewerben(_client(user), szenario["stelle"])
    ids = list(ProjetBewerbung.objects.values_list("id", flat=True))
    _client(szenario["leitung"]).post(reverse("projets:projet-bewerbung-annehmen", args=[ids[0]]))
    szenario["stelle"].refresh_from_db()
    assert szenario["stelle"].status == StatutStelle.OFFEN
    _client(szenario["leitung"]).post(reverse("projets:projet-bewerbung-annehmen", args=[ids[1]]))
    szenario["stelle"].refresh_from_db()
    assert szenario["stelle"].status == StatutStelle.BESETZT
    spaet, _ = _user(email="spaet@example.de")
    assert _bewerben(_client(spaet), szenario["stelle"]).status_code == 404  # nicht mehr offen


def test_ablehnen_und_sichtbarkeit_der_meldungen(szenario):
    a_user, _ = _user(email="a@example.de")
    b_user, _ = _user(email="b@example.de")
    _bewerben(_client(a_user), szenario["stelle"])
    _bewerben(_client(b_user), szenario["stelle"])
    liste = reverse("projets:projet-bewerbung-list")
    assert len(_client(szenario["leitung"]).get(liste).data) == 2
    assert len(_client(a_user).get(liste).data) == 1
    bewerbung = ProjetBewerbung.objects.get(membre__user=a_user)
    resp = _client(szenario["leitung"]).post(
        reverse("projets:projet-bewerbung-ablehnen", args=[bewerbung.id])
    )
    assert resp.data["status"] == "abgelehnt"
    assert not ProjetMitglied.objects.filter(membre=bewerbung.membre).exists()
    assert _bewerben(_client(a_user), szenario["stelle"]).status_code == 400  # abgelehnt bleibt


def test_passende_mitglieder_aus_der_faehigkeiten_datenbank(szenario):
    kann, kann_m = _user(email="kann@example.de")
    MembreFaehigkeit.objects.create(
        membre=kann_m, faehigkeit=szenario["stelle"].faehigkeit, kommentar="Figma"
    )
    inaktiv_u, inaktiv_m = _user(email="in@example.de", statut=StatutMembre.INACTIF)
    MembreFaehigkeit.objects.create(membre=inaktiv_m, faehigkeit=szenario["stelle"].faehigkeit)
    url = reverse("projets:projet-stelle-passende-mitglieder", args=[szenario["stelle"].id])
    resp = _client(szenario["leitung"]).get(url)
    assert [m["id"] for m in resp.data] == [str(kann_m.id)]
    assert resp.data[0]["kommentar"] == "Figma"
    assert _client(kann).get(url).status_code == 403
    _bewerben(_client(kann), szenario["stelle"])
    assert _client(szenario["leitung"]).get(url).data == []  # schon gemeldet


def test_projektliste_zeigt_anzahl_offener_stellen(szenario):
    resp = _client().get(reverse("projets:projet-detail", args=[szenario["projet"].id]))
    assert resp.status_code == 200 and resp.data["stellen_offen"] == 1


def test_projektuebergreifende_liste_offener_stellen_mit_projekttitel(szenario):
    """Übersicht (Dashboard): alle offenen Stellen sichtbarer Projekte, mit Projekttitel."""
    user, _ = _user(email="mitglied@example.de")
    antwort = _client(user).get(reverse(LISTE), {"status": "offen"})
    assert antwort.status_code == 200
    assert [s["projet_titre"] for s in antwort.json()] == [szenario["projet"].titre]
