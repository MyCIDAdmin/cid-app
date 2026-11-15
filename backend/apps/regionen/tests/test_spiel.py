"""Treffen zu einem Spiel (Nov. 2026): Daten aus dem Spielplan übernehmen und nachziehen."""

import datetime

import pytest
from django.utils import timezone

from apps.accounts.models import Role
from apps.communaute.models import StatutRencontre
from apps.communaute.tests.factories import RencontreCalendrierFactory
from apps.notifications.models import Notification
from apps.rbac.tests.factories import UserFactory
from apps.regionen.models import Region, Teilnahme, Veranstaltung
from apps.regionen.tests.test_regionen import BASIS, _client, _mitglied, _verantwortlicher
from apps.regionen.tests.test_veranstaltungen import _aktion, _url

pytestmark = pytest.mark.django_db


@pytest.fixture
def nord():
    return Region.objects.get(slug="nord")


@pytest.fixture
def karte(nord):
    user = _mitglied("HH")
    _verantwortlicher(nord, user, anzeige_name="Alex")
    return user


@pytest.fixture
def buero():
    return UserFactory(role=Role.BUREAU_ADMIN)


@pytest.fixture
def spiel():
    return RencontreCalendrierFactory(
        equipe_domicile="Club Africain",
        equipe_exterieur="Esperance",
        competition="Ligue 1",
        date_heure=timezone.now() + datetime.timedelta(days=10),
        statut=StatutRencontre.PROGRAMMEE,
    )


def _abgesagt_meldungen(user) -> int:
    return Notification.objects.filter(
        destinataire=user,
        titre__in=["Spiel abgesagt – bitte entscheiden", "Match annulé – décision requise"],
    ).count()


def _neu(user, **kw):
    daten = {"ort": "Hamburg, Kneipe X"}
    daten.update(kw)
    return _client(user).post(f"{BASIS}nord/veranstaltungen/", daten, format="json")


def _veroeffentlicht(karte, buero, spiel):
    pk = _neu(karte, spiel=str(spiel.id)).data["id"]
    assert _aktion(karte, pk, "einreichen").status_code == 200
    assert _aktion(buero, pk, "freigeben").status_code == 200
    return pk


def test_spielauswahl_listet_kommende_spiele(karte, spiel):
    RencontreCalendrierFactory(date_heure=timezone.now() - datetime.timedelta(days=2))
    antwort = _client(karte).get(f"{BASIS}spiele/")
    assert antwort.status_code == 200
    assert [s["id"] for s in antwort.data["ergebnisse"]] == [str(spiel.id)]


def test_treffen_uebernimmt_datum_zeit_und_titel_aus_dem_spiel(karte, spiel):
    antwort = _neu(karte, spiel=str(spiel.id), datum="2000-01-01", uhrzeit="01:00")
    assert antwort.status_code == 201, antwort.data
    lokal = timezone.localtime(spiel.date_heure)
    assert antwort.data["datum"] == lokal.date().isoformat()
    assert antwort.data["uhrzeit"] == lokal.strftime("%H:%M")
    assert antwort.data["titel"] == "Club Africain – Esperance"
    assert antwort.data["spiel"]["id"] == str(spiel.id)


def test_eigener_titel_bleibt_erhalten(karte, spiel):
    antwort = _neu(karte, spiel=str(spiel.id), titel="Schauen mit Freunden")
    assert antwort.data["titel"] == "Schauen mit Freunden"


def test_abgesagtes_oder_unbekanntes_spiel_ist_nicht_waehlbar(karte, spiel):
    abgesagt = RencontreCalendrierFactory(
        date_heure=timezone.now() + datetime.timedelta(days=3), statut=StatutRencontre.ANNULEE
    )
    assert _neu(karte, spiel=str(abgesagt.id)).status_code == 400
    assert _neu(karte, spiel="00000000-0000-0000-0000-000000000000").status_code == 400
    assert _neu(karte, spiel="kein-uuid").status_code == 400


def test_ohne_spiel_bleibt_datum_pflicht(karte):
    assert _neu(karte, titel="Ohne Spiel").status_code == 400
    assert _neu(karte, titel="Mit Datum", datum="2027-05-01").status_code == 201


def test_verknuepftes_datum_ist_nicht_von_hand_aenderbar(karte, spiel):
    pk = _neu(karte, spiel=str(spiel.id)).data["id"]
    vorher = Veranstaltung.objects.get(pk=pk).datum
    antwort = _client(karte).patch(_url(pk), {"datum": "2030-01-01"}, format="json")
    assert antwort.status_code == 200
    assert Veranstaltung.objects.get(pk=pk).datum == vorher


def test_verknuepfung_loesen_macht_datum_wieder_frei(karte, spiel):
    pk = _neu(karte, spiel=str(spiel.id)).data["id"]
    antwort = _client(karte).patch(_url(pk), {"spiel": None, "datum": "2030-01-01"}, format="json")
    assert antwort.status_code == 200
    assert antwort.data["spiel"] is None and antwort.data["datum"] == "2030-01-01"


def test_verlegtes_spiel_zieht_treffen_nach_und_informiert(karte, buero, spiel):
    pk = _veroeffentlicht(karte, buero, spiel)
    teilnehmer = _mitglied("HH")
    Teilnahme.objects.create(veranstaltung_id=pk, user=teilnehmer)
    Notification.objects.all().delete()

    spiel.date_heure = spiel.date_heure + datetime.timedelta(days=2, hours=1)
    spiel.statut = StatutRencontre.REPORTEE
    spiel.save()
    spiel.statut = StatutRencontre.PROGRAMMEE
    spiel.save()

    v = Veranstaltung.objects.get(pk=pk)
    lokal = timezone.localtime(spiel.date_heure)
    assert (v.datum, v.uhrzeit) == (lokal.date(), lokal.time().replace(second=0, microsecond=0))
    titel = set(Notification.objects.values_list("titre", flat=True))
    assert titel & {"Treffen verschoben", "Réunion déplacée"}
    assert Notification.objects.filter(destinataire=teilnehmer).exists()
    assert Notification.objects.filter(destinataire=karte).exists()


def test_unveraendertes_spiel_meldet_nichts(karte, buero, spiel):
    _veroeffentlicht(karte, buero, spiel)
    Notification.objects.all().delete()
    spiel.score_domicile = 1
    spiel.save()
    assert not Notification.objects.exists()


def test_absage_wird_einmal_den_verantwortlichen_gemeldet_und_loescht_nichts(karte, buero, spiel):
    pk = _veroeffentlicht(karte, buero, spiel)
    Notification.objects.all().delete()
    spiel.statut = StatutRencontre.ANNULEE
    spiel.save()
    assert Veranstaltung.objects.filter(pk=pk).exists()
    assert _abgesagt_meldungen(karte) == 1
    spiel.save()  # erneute Synchronisation: keine zweite Meldung
    assert _abgesagt_meldungen(karte) == 1


def test_abgesagtes_treffen_wird_nicht_mehr_angefasst(karte, buero, spiel):
    pk = _veroeffentlicht(karte, buero, spiel)
    assert _aktion(karte, pk, "absagen").status_code == 200
    vorher = Veranstaltung.objects.get(pk=pk).datum
    spiel.date_heure = spiel.date_heure + datetime.timedelta(days=5)
    spiel.save()
    assert Veranstaltung.objects.get(pk=pk).datum == vorher
